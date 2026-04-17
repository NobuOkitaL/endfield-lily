# backend/app/routes/operators.py
from __future__ import annotations

import base64
import io
import re
from pathlib import Path

import cv2
import numpy as np
from fastapi import APIRouter, File, HTTPException, UploadFile
from PIL import Image

from app.pipelines.grid_detect import detect_slots
from app.pipelines.ocr import ocr_digits, parse_ocr_result
from app.pipelines.preprocess import load_and_normalize
from app.pipelines.template_match import TemplateLibrary, match_slot

router = APIRouter(prefix="/recognize", tags=["recognize"])

_ASSETS_DIR = Path(__file__).resolve().parent.parent / "assets"
_OPERATORS_JSON = _ASSETS_DIR / "operators.json"

# Strip "Lv." or "Lv" prefix before parsing level number
_LV_PREFIX_RE = re.compile(r"^\s*Lv\.?\s*", re.IGNORECASE)


def _load_library() -> TemplateLibrary:
    """Load the operators template library from disk. Overridable in tests."""
    if not _OPERATORS_JSON.exists():
        return TemplateLibrary({})
    return TemplateLibrary.from_directory(_ASSETS_DIR / "operators", _OPERATORS_JSON)


def _decode_upload(file_bytes: bytes) -> np.ndarray:
    """Decode image bytes to a BGR numpy array. Raises HTTPException on failure."""
    try:
        pil_img = Image.open(io.BytesIO(file_bytes))
        pil_img = pil_img.convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image: {e}")
    arr = np.array(pil_img)
    # PIL RGB → OpenCV BGR
    return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)


def _bbox_to_list(bbox: tuple[int, int, int, int]) -> list[int]:
    return list(bbox)


def _strip_lv_prefix(raw: str) -> str:
    """Remove leading 'Lv.' or 'Lv' prefix from OCR text before numeric parsing."""
    return _LV_PREFIX_RE.sub("", raw)


@router.post("/operators")
async def recognize_operators(image: UploadFile = File(...)):
    """
    Accept a screenshot of the operator select / roster page.
    Return recognised operators (portrait + level) + unknowns.

    v1 scope: portrait recognition (operator_id) and level only.
    Elite stage, skills, and equipment are filled manually in the frontend.
    """
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=415, detail="Expected an image upload")

    raw = await image.read()
    bgr = _decode_upload(raw)
    canvas = load_and_normalize(bgr)
    slots = detect_slots(canvas)

    library = _load_library()
    operators: list[dict] = []
    unknowns: list[dict] = []

    for bbox in slots:
        x, y, w, h = bbox
        # Upper 70% for portrait icon, lower 30% for level text
        portrait_h = int(h * 0.7)
        portrait = canvas[y : y + portrait_h, x : x + w]
        level_region = canvas[y + portrait_h : y + h, x : x + w]

        match = match_slot(portrait, library, threshold=0.85)

        raw_text, conf = ocr_digits(level_region)
        # Strip "Lv." / "Lv" prefix before numeric parsing
        stripped = _strip_lv_prefix(raw_text)
        level = parse_ocr_result(stripped, conf)

        if match.material_id is None or level is None:
            # Encode a thumbnail of the slot for user confirmation
            _, buf = cv2.imencode(".png", canvas[y : y + h, x : x + w])
            thumb_b64 = base64.b64encode(buf.tobytes()).decode("ascii")
            unknowns.append(
                {
                    "bbox": _bbox_to_list(bbox),
                    "icon_thumbnail_base64": thumb_b64,
                    "best_guess_operator_id": match.material_id,
                    "best_guess_confidence": match.confidence,
                    "raw_ocr_text": raw_text,
                }
            )
            continue

        operators.append(
            {
                "operator_id": match.material_id,
                "name": match.material_id,  # TODO: map id → display name via operators.json
                "level": level,
                "confidence": match.confidence,
                "bbox": _bbox_to_list(bbox),
            }
        )

    return {"operators": operators, "unknowns": unknowns}
