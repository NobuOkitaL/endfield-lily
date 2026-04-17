# backend/app/routes/inventory.py
from __future__ import annotations

import base64
import io
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
_MATERIALS_JSON = _ASSETS_DIR / "materials.json"


def _load_library() -> TemplateLibrary:
    """Load the materials template library from disk. Overridable in tests."""
    if not _MATERIALS_JSON.exists():
        return TemplateLibrary({})
    return TemplateLibrary.from_directory(_ASSETS_DIR / "materials", _MATERIALS_JSON)


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


@router.post("/inventory")
async def recognize_inventory(image: UploadFile = File(...)):
    """
    Accept a screenshot of the inventory page.
    Return recognised items + unknowns.
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
        # Upper 70% for icon, lower 30% for quantity digits
        icon_h = int(h * 0.7)
        icon = canvas[y : y + icon_h, x : x + w]
        quantity_region = canvas[y + icon_h : y + h, x : x + w]

        match = match_slot(icon, library, threshold=0.85)

        raw_text, conf = ocr_digits(quantity_region)
        quantity = parse_ocr_result(raw_text, conf)

        if match.material_id is None or quantity is None:
            # Encode a thumbnail of the slot for user confirmation
            _, buf = cv2.imencode(".png", canvas[y : y + h, x : x + w])
            thumb_b64 = base64.b64encode(buf.tobytes()).decode("ascii")
            unknowns.append(
                {
                    "bbox": _bbox_to_list(bbox),
                    "icon_thumbnail_base64": thumb_b64,
                    "best_guess_material_id": match.material_id,
                    "best_guess_confidence": match.confidence,
                    "raw_ocr_text": raw_text,
                }
            )
            continue

        items.append(
            {
                "material_id": match.material_id,
                "material_name": match.material_id,  # TODO: map slug → 中文 via materials.json reverse
                "quantity": quantity,
                "confidence": match.confidence,
                "bbox": _bbox_to_list(bbox),
            }
        )

    return {"items": items, "unknowns": unknowns}
