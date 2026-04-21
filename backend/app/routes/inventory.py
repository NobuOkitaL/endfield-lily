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
    # 武陵仓库 main-grid slots are small (~68px); 7×7 close kernel surfaces
    # them reliably without over-merging neighbors.
    slots = detect_slots(canvas, close_kernel=7)

    library = _load_library()
    items: list[dict] = []
    unknowns: list[dict] = []

    for bbox in slots:
        x, y, w, h = bbox
        icon_h = int(h * 0.7)
        icon = canvas[y : y + icon_h, x : x + w]

        # OCR the quantity at several bottom-crop ratios and pick the best
        # parse. A single fixed ratio doesn't work for all materials: a tight
        # crop (30%) can drop trailing digits on 3-digit quantities
        # ("202" → "20"), while a wider crop (50%) includes icon silhouettes
        # on items like 存续的痕迹 and OCR returns "" or garbage. Trust the
        # parse with the most digits (and higher confidence on ties).
        candidates: list[tuple[int, float, str, int]] = []
        first_rt, first_cf = "", 0.0
        for crop_frac in (0.70, 0.60, 0.50, 0.40):
            qr = canvas[y + int(h * crop_frac) : y + h, x : x + w]
            rt, cf = ocr_digits(qr)
            if not first_rt:
                first_rt, first_cf = rt, cf
            q = parse_ocr_result(rt, cf)
            if q is not None:
                candidates.append((len(str(q)), cf, rt, q))
        if candidates:
            candidates.sort(reverse=True)  # prefer most digits, then higher conf
            _n, conf, raw_text, quantity = candidates[0]
        else:
            raw_text, conf, quantity = first_rt, first_cf, None

        # Run matching with threshold=0 so best_guess is always populated,
        # then apply the real threshold ourselves. This lets unknowns pre-fill
        # a sensible dropdown instead of defaulting to the first option.
        best = match_slot(icon, library, threshold=0.0)
        above_threshold = best.confidence >= 0.80

        # Slot goes to unknowns only when the template match itself is weak.
        # A strong match with a failed OCR (single-digit quantities are hard)
        # still goes to items — the user can fix the quantity in the editor.
        if not above_threshold:
            _, buf = cv2.imencode(".png", canvas[y : y + h, x : x + w])
            thumb_b64 = base64.b64encode(buf.tobytes()).decode("ascii")
            unknowns.append(
                {
                    "bbox": _bbox_to_list(bbox),
                    "icon_thumbnail_base64": thumb_b64,
                    "best_guess_material_id": best.material_id,
                    "best_guess_confidence": best.confidence,
                    "raw_ocr_text": raw_text,
                    "best_guess_quantity": quantity,
                }
            )
            continue

        match = best
        if quantity is None:
            quantity = 0

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
