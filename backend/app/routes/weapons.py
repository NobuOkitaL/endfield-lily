# backend/app/routes/weapons.py
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
_WEAPONS_JSON = _ASSETS_DIR / "weapons.json"

_LV_PREFIX_RE = re.compile(r"^\s*Lv\.?\s*", re.IGNORECASE)


def _load_library() -> TemplateLibrary:
    """Load the weapons template library from disk. Overridable in tests."""
    if not _WEAPONS_JSON.exists():
        return TemplateLibrary({})
    return TemplateLibrary.from_directory(_ASSETS_DIR / "weapons", _WEAPONS_JSON)


def _decode_upload(file_bytes: bytes) -> np.ndarray:
    try:
        pil_img = Image.open(io.BytesIO(file_bytes))
        pil_img = pil_img.convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image: {e}")
    arr = np.array(pil_img)
    return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)


def _bbox_to_list(bbox: tuple[int, int, int, int]) -> list[int]:
    return list(bbox)


def _strip_lv_prefix(raw: str) -> str:
    return _LV_PREFIX_RE.sub("", raw)


@router.post("/weapons")
async def recognize_weapons(image: UploadFile = File(...)):
    """
    Accept a screenshot of the weapon roster page.
    Return recognised weapons (icon + level) + unknowns.

    v1 scope: icon recognition (weapon name) and level only.
    破限阶段 is filled manually in the frontend.
    """
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=415, detail="Expected an image upload")

    raw = await image.read()
    bgr = _decode_upload(raw)
    canvas = load_and_normalize(bgr)
    slots = detect_slots(canvas)

    library = _load_library()
    items: list[dict] = []
    unknowns: list[dict] = []

    for bbox in slots:
        x, y, w, h = bbox
        # Upper 70% for icon, lower 30% for level text (same layout as operators)
        icon_h = int(h * 0.7)
        icon = canvas[y : y + icon_h, x : x + w]
        level_region = canvas[y + icon_h : y + h, x : x + w]

        match = match_slot(icon, library, threshold=0.80)

        raw_text, conf = ocr_digits(level_region)
        stripped = _strip_lv_prefix(raw_text)
        level = parse_ocr_result(stripped, conf)

        if match.material_id is None or level is None:
            _, buf = cv2.imencode(".png", canvas[y : y + h, x : x + w])
            thumb_b64 = base64.b64encode(buf.tobytes()).decode("ascii")
            unknowns.append(
                {
                    "bbox": _bbox_to_list(bbox),
                    "icon_thumbnail_base64": thumb_b64,
                    "best_guess_weapon_id": match.material_id,
                    "best_guess_confidence": match.confidence,
                    "raw_ocr_text": raw_text,
                }
            )
            continue

        items.append(
            {
                "weapon_id": match.material_id,
                "name": match.material_id,
                "level": level,
                "confidence": match.confidence,
                "bbox": _bbox_to_list(bbox),
            }
        )

    return {"items": items, "unknowns": unknowns}
