# backend/app/routes/operators.py
from __future__ import annotations

import base64
import io
import logging
import time
from collections import Counter
from pathlib import Path

import cv2
import numpy as np
from fastapi import APIRouter, File, HTTPException, UploadFile
from PIL import Image

from app.log_util import make_request_id
from app.pipelines.grid_detect import detect_slots, p75_height
from app.pipelines.level_ocr import ocr_level_cascade
from app.pipelines.preprocess import load_and_normalize
from app.pipelines.template_match import (
    TemplateLibrary,
    is_confident_match,
    load_template_library,
    match_slot,
)
from app.recognition_runtime import recognition_slot

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/recognize", tags=["recognize"])

_ASSETS_DIR = Path(__file__).resolve().parent.parent / "assets"
_OPERATORS_JSON = _ASSETS_DIR / "operators.json"

_OPERATOR_LEVEL_CROP_FRACS = (0.70, 0.60, 0.50, 0.40)
_MIN_OCR_MATCH_CONFIDENCE = 0.10


def _load_library() -> TemplateLibrary:
    """Load the operators template library from disk. Overridable in tests."""
    if not _OPERATORS_JSON.exists():
        return TemplateLibrary({})
    return load_template_library(_ASSETS_DIR / "operators", _OPERATORS_JSON)


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


@router.post("/operators")
def recognize_operators(image: UploadFile = File(...)):
    """
    Accept a screenshot of the operator select / roster page.
    Return recognised operators (portrait + level) + unknowns.

    v1 scope: portrait recognition (operator_id) and level only.
    Elite stage, skills, and equipment are filled manually in the frontend.
    """
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=415, detail="Expected an image upload")

    raw = image.file.read()
    with recognition_slot():
        return _recognize_operators_bytes(raw)


def _recognize_operators_bytes(raw: bytes) -> dict[str, list[dict]]:
    rid = make_request_id("op")
    t_start = time.perf_counter()
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
    for bbox in slots:
        x, y, w, h = bbox
        portrait_h = int(h * 0.7)
        portrait = canvas[y : y + portrait_h, x : x + w]
        slot_matches.append((bbox, match_slot(portrait, library, threshold=0.0)))
    n_strong = sum(
        1
        for _, match in slot_matches
        if is_confident_match(match)
    )
    _log.info(
        "[%s] template_match: library=%d, %d strong / %d unknown (%.2fs)",
        rid,
        len(library),
        n_strong,
        len(slot_matches) - n_strong,
        time.perf_counter() - t0,
    )

    items: list[dict] = []
    unknowns: list[dict] = []
    ocr_routes: Counter[str] = Counter()

    t0 = time.perf_counter()
    for bbox, best in slot_matches:
        x, y, w, h = bbox
        if best.confidence < _MIN_OCR_MATCH_CONFIDENCE:
            raw_text, level = "", None
            ocr_routes["skipped_weak_match"] += 1
        else:
            level_result = ocr_level_cascade(
                canvas,
                bbox,
                target_h,
                _OPERATOR_LEVEL_CROP_FRACS,
            )
            raw_text = level_result.raw_text
            level = level_result.level
            ocr_routes[level_result.route] += 1

        above_threshold = is_confident_match(best)

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
        "[%s] OCR: %d fast-det, %d accurate fallback, %d legacy fallback, "
        "%d skipped weak, %d unresolved (%.2fs)",
        rid,
        ocr_routes["fast_detector"],
        ocr_routes["accurate_detector"],
        ocr_routes["legacy_detector"],
        ocr_routes["skipped_weak_match"],
        ocr_routes["unknown"],
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
