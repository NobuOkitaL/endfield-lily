# backend/app/routes/operators.py
from __future__ import annotations

import base64
import io
import logging
import re
import time
from pathlib import Path

import cv2
import numpy as np
from fastapi import APIRouter, File, HTTPException, UploadFile
from PIL import Image

from app.log_util import make_request_id
from app.pipelines.grid_detect import detect_slots, p75_height
from app.pipelines.ocr import ocr_digits, parse_ocr_result
from app.pipelines.preprocess import load_and_normalize
from app.pipelines.template_match import TemplateLibrary, match_slot

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/recognize", tags=["recognize"])

_ASSETS_DIR = Path(__file__).resolve().parent.parent / "assets"
_OPERATORS_JSON = _ASSETS_DIR / "operators.json"

# Strip "Lv." or "Lv" prefix before parsing level number
_LV_PREFIX_RE = re.compile(r"^\s*Lv\.?\s*", re.IGNORECASE)
_OPERATOR_LEVEL_CROP_FRACS = (0.70, 0.60, 0.50, 0.40)


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

    rid = make_request_id("op")
    t_start = time.perf_counter()
    raw = await image.read()
    bgr = _decode_upload(raw)
    canvas = load_and_normalize(bgr)
    canvas_h, canvas_w = canvas.shape[:2]
    _log.info(
        "[%s] POST /recognize/operators  (%.1fMB, %dx%d)",
        rid,
        len(raw) / (1024 * 1024),
        canvas_w,
        canvas_h,
    )

    # 5 is the kernel the user's labeled templates were captured with;
    # changing it here invalidates those labels.
    t0 = time.perf_counter()
    slots = detect_slots(canvas, close_kernel=5)
    _log.info(
        "[%s] detect_slots: %d cells (%.2fs)",
        rid,
        len(slots),
        time.perf_counter() - t0,
    )
    # Otsu sometimes crops operator cards right at the portrait/rarity-strip
    # boundary, losing the "Lv.XX" text below. Extend the OCR region down to
    # the taller P75 card height when the current bbox is shorter. Template
    # matching still uses the original bbox (so it keeps matching templates
    # captured at the short height) — only the level-text crop is extended.
    target_h = p75_height(list(slots))

    t0 = time.perf_counter()
    library = _load_library()
    slot_matches = []
    n_strong = 0
    n_weak = 0
    for bbox in slots:
        x, y, w, h = bbox
        portrait_h = int(h * 0.7)
        portrait = canvas[y : y + portrait_h, x : x + w]
        best = match_slot(portrait, library, threshold=0.0)
        above_threshold = best.confidence >= 0.80
        if above_threshold:
            n_strong += 1
        else:
            n_weak += 1
        slot_matches.append((bbox, best))
    _log.info(
        "[%s] template_match: library=%d, %d strong / %d unknown (%.2fs)",
        rid,
        len(library),
        n_strong,
        n_weak,
        time.perf_counter() - t0,
    )

    items: list[dict] = []
    unknowns: list[dict] = []

    t0 = time.perf_counter()
    for bbox, best in slot_matches:
        x, y, w, h = bbox
        # Effective slot height for OCR: extend down to P75 if this bbox is
        # shorter, clamped to the canvas bottom.
        eff_h = min(max(h, target_h), canvas_h - y)

        # Multi-crop OCR on the level text, same pattern as inventory. The
        # level sits in the bottom-right of the card; tight crops sometimes
        # clip the leading "Lv." or the trailing digit. Pick the parse with
        # the most digits / highest confidence.
        candidates: list[tuple[int, float, str, int]] = []
        first_rt, first_cf = "", 0.0
        for crop_frac in _OPERATOR_LEVEL_CROP_FRACS:
            region = canvas[y + int(eff_h * crop_frac) : y + eff_h, x : x + w]
            rt, cf = ocr_digits(region)
            stripped = _strip_lv_prefix(rt)
            if not first_rt:
                first_rt, first_cf = rt, cf
            lv = parse_ocr_result(stripped, cf)
            if lv is not None and lv > 0:
                candidates.append((len(str(lv)), cf, rt, lv))
        if candidates:
            candidates.sort(reverse=True)
            _n, conf, raw_text, level = candidates[0]
        else:
            raw_text, conf, level = first_rt, first_cf, None

        above_threshold = best.confidence >= 0.80

        # Weak template match → unknowns (regardless of OCR outcome).
        # Strong match but OCR failed → items with level=0 for user to edit.
        if not above_threshold:
            _, buf = cv2.imencode(".png", canvas[y : y + h, x : x + w])
            thumb_b64 = base64.b64encode(buf.tobytes()).decode("ascii")
            unknowns.append(
                {
                    "bbox": _bbox_to_list(bbox),
                    "icon_thumbnail_base64": thumb_b64,
                    "best_guess_operator_id": best.material_id,
                    "best_guess_confidence": best.confidence,
                    "raw_ocr_text": raw_text,
                    "best_guess_level": level,
                }
            )
            continue

        items.append(
            {
                "operator_id": best.material_id,
                "name": best.material_id,
                "level": level if level is not None else 0,
                "confidence": best.confidence,
                "bbox": _bbox_to_list(bbox),
            }
        )

    _log.info(
        "[%s] OCR: %d slots × %d crops, det engine (%.2fs)",
        rid,
        len(slot_matches),
        len(_OPERATOR_LEVEL_CROP_FRACS),
        time.perf_counter() - t0,
    )
    _log.info(
        "[%s] done in %.2fs → %d items, %d unknowns",
        rid,
        time.perf_counter() - t_start,
        len(items),
        len(unknowns),
    )
    return {"items": items, "unknowns": unknowns}
