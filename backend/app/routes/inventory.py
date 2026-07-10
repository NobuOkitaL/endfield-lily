# backend/app/routes/inventory.py
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
from app.pipelines.ocr import (
    DetectorProfile,
    PARSEABLE_CONFIDENCE_FLOOR,
    ocr_digits,
    parse_ocr_result,
    parse_quantity_string_strict,
)
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
_MATERIALS_JSON = _ASSETS_DIR / "materials.json"


def _load_library() -> TemplateLibrary:
    """Load the materials template library from disk. Overridable in tests."""
    if not _MATERIALS_JSON.exists():
        return TemplateLibrary({})
    return load_template_library(_ASSETS_DIR / "materials", _MATERIALS_JSON)


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


# Bottom-strip OCR ratios. 0.85/0.78 isolate the quantity text band where
# icon silhouettes don't intrude (a red-crystal spike on 燎石 was reading
# as a leading "1", turning 76 → 176 at wider crops).
_QTY_CROP_FRACS = (0.85, 0.78, 0.70, 0.60, 0.50, 0.40)
_TOP_BAR_CURRENCY_ID = "折金票"
_TOP_BAR_CURRENCY_REGION = (1320, 12, 340, 58)
_TOP_BAR_CURRENCY_OCR_REGIONS = (
    _TOP_BAR_CURRENCY_REGION,
    (1320, 18, 340, 44),
    (1320, 8, 340, 66),
)
_NO_DET_STRONG_CONFIDENCE = 0.50
_MIN_OCR_MATCH_CONFIDENCE = 0.10

QuantityCandidate = tuple[int, float, str, float]


def _prepare_qty_ocr_image(region: np.ndarray) -> np.ndarray:
    """3× upscale + sharpen + Otsu binarize. Cleans up icon silhouettes that
    abut the digit text, which matters at wider bottom crops."""
    gray = cv2.cvtColor(region, cv2.COLOR_BGR2GRAY) if region.ndim == 3 else region
    upscaled = cv2.resize(gray, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)
    blurred = cv2.GaussianBlur(upscaled, (0, 0), 1.0)
    sharpened = cv2.addWeighted(upscaled, 1.8, blurred, -0.8, 0)
    _, thresholded = cv2.threshold(
        sharpened, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU
    )
    return cv2.cvtColor(thresholded, cv2.COLOR_GRAY2BGR)


def _rank_quantity_candidates(
    candidates: list[QuantityCandidate],
) -> list[tuple[int, dict[str, object]]]:
    grouped: dict[int, dict[str, object]] = {}
    for value, confidence, raw_text, source in candidates:
        data = grouped.setdefault(
            value,
            {"sources": set(), "max_conf": 0.0, "best_raw": ""},
        )
        sources = data["sources"]
        assert isinstance(sources, set)
        sources.add(source)
        if confidence > data["max_conf"]:
            data["max_conf"] = confidence
            data["best_raw"] = raw_text
    return sorted(
        grouped.items(),
        key=lambda item: (
            -len(item[1]["sources"]),
            -len(str(item[0])),
            -float(item[1]["max_conf"]),
        ),
    )


def _quantity_consensus(
    candidates: list[QuantityCandidate],
    *,
    min_sources: int,
    min_confidence: float,
) -> tuple[str, float, int] | None:
    ranked = _rank_quantity_candidates(candidates)
    if not ranked:
        return None
    value, data = ranked[0]
    source_count = len(data["sources"])
    second_count = len(ranked[1][1]["sources"]) if len(ranked) > 1 else 0
    confidence = float(data["max_conf"])
    if (
        value != 0
        and source_count >= min_sources
        and source_count > second_count
        and confidence >= min_confidence
    ):
        return str(data["best_raw"]), confidence, value
    return None


def _ocr_inventory_quantity(
    canvas: np.ndarray, x: int, y: int, w: int, eff_h: int,
) -> tuple[str, float, int | None, str]:
    """Run no-det OCR first, then fall back to detector OCR voting.

    The no-det path is fast but only trusted when clean, strict parses agree
    across distinct crop ratios. The detector fallback preserves the previous
    loose parse/vote behavior, including leading-junk rescue.

    Returns ``(raw_text, confidence, value, route)`` with the accepted OCR
    profile so callers can tally routing stats.
    """
    strict_candidates: list[QuantityCandidate] = []
    first_rt, first_cf = "", 0.0
    crop_variants: list[tuple[float, tuple[np.ndarray, np.ndarray]]] = []
    # Quantity text is centered in the card's bottom strip. Excluding the icon
    # edges reduces detector pixels and removes silhouette strokes that can be
    # mistaken for a leading digit.
    qty_x1 = x + int(w * 0.15)
    qty_x2 = x + max(int(w * 0.85), int(w * 0.15) + 1)

    for index, frac in enumerate(_QTY_CROP_FRACS):
        region = canvas[
            y + int(eff_h * frac) : y + eff_h,
            qty_x1:qty_x2,
        ]
        if region.size == 0:
            continue
        variants = (region, _prepare_qty_ocr_image(region))
        crop_variants.append((frac, variants))
        for variant in variants:
            rt, cf = ocr_digits(variant, use_text_det=False)
            if not first_rt:
                first_rt, first_cf = rt, cf
            if cf >= PARSEABLE_CONFIDENCE_FLOOR:
                strict_value = parse_quantity_string_strict(rt)
                if strict_value is not None:
                    strict_candidates.append((strict_value, cf, rt, frac))
        if index >= 1:
            accepted = _quantity_consensus(
                strict_candidates,
                min_sources=2,
                min_confidence=_NO_DET_STRONG_CONFIDENCE,
            )
            if accepted is not None:
                raw_text, confidence, value = accepted
                return raw_text, confidence, value, "fastpath"

    # A bounded detector handles most multi-digit crops at a fraction of the
    # cost of RapidOCR's default detector. Only cross-crop agreement is trusted.
    fast_candidates: list[QuantityCandidate] = []
    for index, (frac, variants) in enumerate(crop_variants):
        for variant in variants:
            rt, cf = ocr_digits(
                variant,
                use_text_det=True,
                detector_profile="fast",
            )
            if not first_rt:
                first_rt, first_cf = rt, cf
            if cf >= PARSEABLE_CONFIDENCE_FLOOR:
                value = parse_quantity_string_strict(rt)
                if value is not None:
                    fast_candidates.append((value, cf, rt, frac))
        if index >= 1:
            accepted = _quantity_consensus(
                fast_candidates,
                min_sources=2,
                min_confidence=0.60,
            )
            if accepted is not None:
                raw_text, confidence, value = accepted
                return raw_text, confidence, value, "fast_detector"

    strict_candidates = []
    candidates: list[QuantityCandidate] = []
    det_first_rt, det_first_cf = "", 0.0
    for index, (frac, variants) in enumerate(crop_variants):
        for variant in variants:
            rt, cf = ocr_digits(variant, use_text_det=True)
            if not det_first_rt:
                det_first_rt, det_first_cf = rt, cf
            if cf >= PARSEABLE_CONFIDENCE_FLOOR:
                strict_value = parse_quantity_string_strict(rt)
                if strict_value is not None:
                    strict_candidates.append((strict_value, cf, rt, frac))
            q = parse_ocr_result(rt, cf)
            if q is not None:
                candidates.append((q, cf, rt, frac))

        if index >= 1 and strict_candidates:
            ranked = _rank_quantity_candidates(strict_candidates)
            top_value, top_data = ranked[0]
            top_frac_count = len(top_data["sources"])
            second_frac_count = (
                len(ranked[1][1]["sources"]) if len(ranked) > 1 else 0
            )
            if index == 1:
                if (
                    top_frac_count >= 2
                    and top_data["max_conf"] >= 0.60
                    and top_frac_count > second_frac_count
                ):
                    return (
                        str(top_data["best_raw"]),
                        float(top_data["max_conf"]),
                        top_value,
                        "fallback_early",
                    )
            elif index >= 3:
                if (
                    top_frac_count >= 3
                    or (top_frac_count - second_frac_count) >= 2
                ):
                    # Early-stop on the last frac means we already ran every
                    # crop, so it's not actually "early" — count it as complete.
                    route = (
                        "fallback_early"
                        if index < len(_QTY_CROP_FRACS) - 1
                        else "fallback_complete"
                    )
                    return (
                        str(top_data["best_raw"]),
                        float(top_data["max_conf"]),
                        top_value,
                        route,
                    )

    final_route = "fallback_complete"
    if not candidates:
        legacy_candidates: list[QuantityCandidate] = []
        for index, (frac, variants) in enumerate(crop_variants):
            for variant in variants:
                rt, cf = ocr_digits(
                    variant,
                    use_text_det=True,
                    detector_profile="legacy",
                )
                if cf < PARSEABLE_CONFIDENCE_FLOOR:
                    continue
                value = parse_ocr_result(rt, cf)
                if value is not None:
                    legacy_candidates.append((value, cf, rt, frac))
            if index >= 1:
                accepted = _quantity_consensus(
                    legacy_candidates,
                    min_sources=2,
                    min_confidence=0.50,
                )
                if accepted is not None:
                    raw_text, confidence, value = accepted
                    return raw_text, confidence, value, "legacy_detector"
        if not legacy_candidates:
            return det_first_rt or first_rt, det_first_cf or first_cf, None, "unknown"
        candidates = legacy_candidates
        final_route = "legacy_detector"

    ranked = _rank_quantity_candidates(candidates)
    chosen, data = ranked[0]
    return (
        str(data["best_raw"]),
        float(data["max_conf"]),
        chosen,
        final_route,
    )


def _recognize_top_bar_currency(canvas: np.ndarray) -> dict | None:
    """Read the persistent top-right '折金票' balance shown on every inventory
    screen. Returns a synthetic item dict if reading succeeds, else None.

    The currency is at a fixed canvas location — not detectable via
    detect_slots — so we OCR it directly using the same preprocessing /
    voting pipeline as grid quantities. Frontend dedup (max value) handles
    the case where the user uploads multiple screenshots from the same
    session: the balance is identical, so only one merged entry surfaces.
    """
    canvas_h, canvas_w = canvas.shape[:2]
    variants: list[tuple[float, np.ndarray]] = []

    for source, (x, y, w, h) in enumerate(_TOP_BAR_CURRENCY_OCR_REGIONS):
        if x >= canvas_w or y >= canvas_h:
            continue
        crop = canvas[y : min(y + h, canvas_h), x : min(x + w, canvas_w)]
        if crop.size == 0:
            continue
        for variant in (crop, _prepare_qty_ocr_image(crop)):
            variants.append((float(source), variant))

    candidates: list[QuantityCandidate] = []

    def run_profile(
        *,
        use_text_det: bool,
        detector_profile: DetectorProfile = "accurate",
        strict: bool,
    ) -> tuple[str, float, int] | None:
        candidates.clear()
        for source, variant in variants:
            raw_text, confidence = ocr_digits(
                variant,
                use_text_det=use_text_det,
                detector_profile=detector_profile,
            )
            if confidence < PARSEABLE_CONFIDENCE_FLOOR:
                continue
            value = (
                parse_quantity_string_strict(raw_text)
                if strict
                else parse_ocr_result(raw_text, confidence)
            )
            if value is not None:
                candidates.append((value, confidence, raw_text, source))
        return _quantity_consensus(
            candidates,
            min_sources=2,
            min_confidence=0.50,
        )

    accepted = run_profile(use_text_det=False, strict=True)
    if accepted is None:
        accepted = run_profile(
            use_text_det=True,
            detector_profile="fast",
            strict=True,
        )
    if accepted is None:
        accepted = run_profile(use_text_det=True, strict=False)

    if accepted is None and not candidates:
        return None

    if accepted is not None:
        _raw_text, cf, chosen = accepted
    else:
        chosen, data = _rank_quantity_candidates(candidates)[0]
        cf = float(data["max_conf"])
    if chosen == 0 or cf < 0.3:
        return None

    return {
        "material_id": _TOP_BAR_CURRENCY_ID,
        "material_name": _TOP_BAR_CURRENCY_ID,
        "quantity": chosen,
        "confidence": cf,
        "bbox": _bbox_to_list(_TOP_BAR_CURRENCY_REGION),
    }


@router.post("/inventory")
def recognize_inventory(image: UploadFile = File(...)):
    """
    Accept a screenshot of the inventory page.
    Return recognised items + unknowns.
    """
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=415, detail="Expected an image upload")

    raw = image.file.read()
    with recognition_slot():
        return _recognize_inventory_bytes(raw)


def _recognize_inventory_bytes(raw: bytes) -> dict[str, list[dict]]:
    rid = make_request_id("inv")
    t_start = time.perf_counter()
    bgr = _decode_upload(raw)
    canvas = load_and_normalize(bgr)
    canvas_h, canvas_w = canvas.shape[:2]
    _log.info(
        "[%s] POST /recognize/inventory  (%.1fMB, %dx%d)",
        rid,
        len(raw) / (1024 * 1024),
        canvas_w,
        canvas_h,
    )

    # 武陵仓库 main-grid slots are small (~68px); 7×7 close kernel surfaces
    # them reliably without over-merging neighbors.
    t0 = time.perf_counter()
    slots = detect_slots(canvas, close_kernel=7)
    _log.info(
        "[%s] detect_slots: %d cells (%.2fs)",
        rid,
        len(slots),
        time.perf_counter() - t0,
    )
    # edge_lattice augmentation can return undersized cells whose bbox ends
    # above the level/quantity text. Extend the OCR region down to the
    # P75 slot height (same trick operators / weapons routes use) so short
    # bboxes still capture the digit row.
    target_h = p75_height(list(slots))

    t0 = time.perf_counter()
    library = _load_library()
    slot_matches = []
    for bbox in slots:
        x, y, w, h = bbox
        icon_h = int(h * 0.7)
        icon = canvas[y : y + icon_h, x : x + w]
        slot_matches.append((bbox, match_slot(icon, library, threshold=0.0)))
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
    for idx, (bbox, best) in enumerate(slot_matches):
        x, y, w, h = bbox
        eff_h = min(max(h, target_h), canvas_h - y)
        if best.confidence < _MIN_OCR_MATCH_CONFIDENCE:
            raw_text, conf, quantity, route = "", 0.0, None, "skipped_weak_match"
        else:
            raw_text, conf, quantity, route = _ocr_inventory_quantity(
                canvas, x, y, w, eff_h,
            )
        ocr_routes[route] += 1
        above_threshold = is_confident_match(best)

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
            _log.debug(
                "[%s] slot %d/%d bbox=%s match=%s conf=%.3f ocr=%r qty=%s "
                "route=%s",
                rid,
                idx + 1,
                len(slot_matches),
                bbox,
                best.material_id,
                best.confidence,
                raw_text,
                quantity,
                route,
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
        _log.debug(
            "[%s] slot %d/%d bbox=%s match=%s conf=%.3f ocr=%r qty=%s route=%s",
            rid,
            idx + 1,
            len(slot_matches),
            bbox,
            match.material_id,
            match.confidence,
            raw_text,
            quantity,
            route,
        )

    currency = _recognize_top_bar_currency(canvas)
    if currency is not None:
        items.append(currency)

    _log.info(
        "[%s] OCR: %d no-det, %d fast-det, %d accurate fallback, "
        "%d legacy fallback, %d skipped weak, %d accurate early exits (%.2fs)",
        rid,
        ocr_routes["fastpath"],
        ocr_routes["fast_detector"],
        ocr_routes["fallback_early"]
        + ocr_routes["fallback_complete"]
        + ocr_routes["unknown"],
        ocr_routes["legacy_detector"],
        ocr_routes["skipped_weak_match"],
        ocr_routes["fallback_early"],
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
