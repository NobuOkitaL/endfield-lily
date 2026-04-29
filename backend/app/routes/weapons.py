# backend/app/routes/weapons.py
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
from app.pipelines.ocr import ocr_digits, parse_ocr_result, parse_quantity_string
from app.pipelines.preprocess import load_and_normalize
from app.pipelines.template_match import TemplateLibrary, match_slot

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/recognize", tags=["recognize"])

_ASSETS_DIR = Path(__file__).resolve().parent.parent / "assets"
_WEAPONS_JSON = _ASSETS_DIR / "weapons.json"

_LV_PREFIX_RE = re.compile(r"^\s*Lv\.?\s*", re.IGNORECASE)
_WEAPON_LEVEL_CROP_FRACS = (0.84, 0.70, 0.60, 0.50, 0.40, 0.35)
_MIN_LOW_CONF_LV1 = 0.10
_MIN_WEAPON_LEVEL = 1
_MAX_WEAPON_LEVEL = 90


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


def _filter_weapon_grid_slots(
    slots: list[tuple[int, int, int, int]], canvas_w: int
) -> list[tuple[int, int, int, int]]:
    """Drop the weapon-page left sidebar column when Otsu detects it as cards."""
    if len(slots) < 8:
        return slots

    sorted_slots = sorted(slots, key=lambda b: (b[1], b[0]))
    widths = sorted(s[2] for s in sorted_slots)
    median_w = widths[len(widths) // 2]
    columns: list[list[tuple[int, int, int, int]]] = []
    for slot in sorted(sorted_slots, key=lambda b: b[0]):
        for col in columns:
            if abs(slot[0] - col[0][0]) <= median_w * 0.25:
                col.append(slot)
                break
        else:
            columns.append([slot])

    if len(columns) != 8:
        return sorted_slots

    left_col = columns[0]
    next_col = columns[1]
    left_x = min(s[0] for s in left_col)
    next_x = min(s[0] for s in next_col)
    # On the weapon roster, the sidebar occupies the far-left chrome while the
    # real 7-column weapon grid begins just to its right. Synthetic tests and
    # other layouts do not satisfy this page-specific geometry.
    if left_x < canvas_w * 0.10 <= next_x:
        drop_x = left_col[0][0]
        return [s for s in sorted_slots if abs(s[0] - drop_x) > median_w * 0.25]

    return sorted_slots


def _prepare_weapon_level_ocr_image(region: np.ndarray) -> np.ndarray:
    """Boost low-contrast Lv text for weapon cards before RapidOCR sees it."""
    gray = cv2.cvtColor(region, cv2.COLOR_BGR2GRAY) if region.ndim == 3 else region
    upscaled = cv2.resize(gray, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)
    blurred = cv2.GaussianBlur(upscaled, (0, 0), 1.0)
    sharpened = cv2.addWeighted(upscaled, 1.8, blurred, -0.8, 0)
    _, thresholded = cv2.threshold(
        sharpened, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU
    )
    return cv2.cvtColor(thresholded, cv2.COLOR_GRAY2BGR)


def _parse_weapon_level(raw_text: str, confidence: float) -> int | None:
    stripped = _strip_lv_prefix(raw_text).strip()
    level = parse_ocr_result(stripped, confidence)
    if level is None:
        # RapidOCR can score isolated "1" very low even after preprocessing;
        # keep that rescue local to weapon levels so inventory quantities do
        # not inherit a looser global confidence floor.
        parsed = parse_quantity_string(stripped)
        if parsed == 1 and confidence >= _MIN_LOW_CONF_LV1:
            level = 1

    if level is None:
        return None
    if not (_MIN_WEAPON_LEVEL <= level <= _MAX_WEAPON_LEVEL):
        return None
    return level


def _choose_weapon_level(
    candidates: list[tuple[int, float, str]]
) -> tuple[str, float, int | None]:
    if not candidates:
        return "", 0.0, None

    grouped: dict[int, list[tuple[float, str]]] = {}
    for level, confidence, raw_text in candidates:
        grouped.setdefault(level, []).append((confidence, raw_text))

    level = max(
        grouped,
        key=lambda lv: (
            len(grouped[lv]),
            len(str(lv)),
            max(conf for conf, _raw in grouped[lv]),
        ),
    )
    confidence, raw_text = max(grouped[level], key=lambda item: item[0])
    return raw_text, confidence, level


def _ocr_weapon_level(
    canvas: np.ndarray, bbox: tuple[int, int, int, int], target_h: int
) -> tuple[str, float, int | None]:
    x, y, w, h = bbox
    canvas_h = canvas.shape[0]
    eff_h = min(max(h, target_h), canvas_h - y)
    candidates: list[tuple[int, float, str]] = []
    first_rt, first_cf = "", 0.0

    for crop_frac in _WEAPON_LEVEL_CROP_FRACS:
        region = canvas[y + int(eff_h * crop_frac) : y + eff_h, x : x + w]
        if region.size == 0:
            continue
        prepared = _prepare_weapon_level_ocr_image(region)
        rt, cf = ocr_digits(prepared)
        if not first_rt:
            first_rt, first_cf = rt, cf
        level = _parse_weapon_level(rt, cf)
        if level is not None:
            candidates.append((level, cf, rt))

    raw_text, confidence, level = _choose_weapon_level(candidates)
    if level is None:
        return first_rt, first_cf, None
    return raw_text, confidence, level


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

    rid = make_request_id("wpn")
    t_start = time.perf_counter()
    raw = await image.read()
    bgr = _decode_upload(raw)
    canvas = load_and_normalize(bgr)
    canvas_h, canvas_w = canvas.shape[:2]
    _log.info(
        "[%s] POST /recognize/weapons  (%.1fMB, %dx%d)",
        rid,
        len(raw) / (1024 * 1024),
        canvas_w,
        canvas_h,
    )

    # 5 is the kernel the user's labeled templates were captured with;
    # changing it here invalidates those labels.
    t0 = time.perf_counter()
    slots = _filter_weapon_grid_slots(
        detect_slots(canvas, close_kernel=5), canvas.shape[1]
    )
    _log.info(
        "[%s] detect_slots: %d cells (%.2fs)",
        rid,
        len(slots),
        time.perf_counter() - t0,
    )
    target_h = p75_height(list(slots))

    t0 = time.perf_counter()
    library = _load_library()
    slot_matches = []
    n_strong = 0
    n_weak = 0
    for bbox in slots:
        x, y, w, h = bbox
        icon_h = int(h * 0.7)
        icon = canvas[y : y + icon_h, x : x + w]
        best = match_slot(icon, library, threshold=0.0)
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
        above_threshold = best.confidence >= 0.80

        raw_text, conf, level = _ocr_weapon_level(canvas, bbox, target_h)

        if not above_threshold:
            _, buf = cv2.imencode(".png", canvas[y : y + h, x : x + w])
            thumb_b64 = base64.b64encode(buf.tobytes()).decode("ascii")
            unknowns.append(
                {
                    "bbox": _bbox_to_list(bbox),
                    "icon_thumbnail_base64": thumb_b64,
                    "best_guess_weapon_id": best.material_id,
                    "best_guess_confidence": best.confidence,
                    "raw_ocr_text": raw_text,
                    "best_guess_level": level,
                }
            )
            continue

        items.append(
            {
                "weapon_id": best.material_id,
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
        len(_WEAPON_LEVEL_CROP_FRACS),
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
