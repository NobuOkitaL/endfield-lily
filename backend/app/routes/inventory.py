# backend/app/routes/inventory.py
from __future__ import annotations

import base64
import io
from pathlib import Path

import cv2
import numpy as np
from fastapi import APIRouter, File, HTTPException, UploadFile
from PIL import Image

from app.pipelines.grid_detect import detect_slots, p75_height
from app.pipelines.ocr import (
    PARSEABLE_CONFIDENCE_FLOOR,
    ocr_digits,
    parse_ocr_result,
    parse_quantity_string_strict,
)
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


def _ocr_inventory_quantity(
    canvas: np.ndarray, x: int, y: int, w: int, eff_h: int
) -> tuple[str, float, int | None]:
    """Run no-det OCR first, then fall back to detector OCR voting.

    The no-det path is fast but only trusted when clean, strict parses agree
    across distinct crop ratios. The detector fallback preserves the previous
    loose parse/vote behavior, including leading-junk rescue.
    """
    strict_candidates: list[tuple[int, float, str, float]] = []
    first_rt, first_cf = "", 0.0

    for frac in _QTY_CROP_FRACS:
        region = canvas[y + int(eff_h * frac) : y + eff_h, x : x + w]
        if region.size == 0:
            continue
        for variant in (region, _prepare_qty_ocr_image(region)):
            rt, cf = ocr_digits(variant, use_text_det=False)
            if not first_rt:
                first_rt, first_cf = rt, cf
            if cf >= PARSEABLE_CONFIDENCE_FLOOR:
                strict_value = parse_quantity_string_strict(rt)
                if strict_value is not None:
                    strict_candidates.append((strict_value, cf, rt, frac))

    by_value: dict[int, dict] = {}
    for value, confidence, raw_text, frac in strict_candidates:
        slot = by_value.setdefault(
            value,
            {"fracs": set(), "max_conf": 0.0, "best_rt": ""},
        )
        slot["fracs"].add(frac)
        if confidence > slot["max_conf"]:
            slot["max_conf"], slot["best_rt"] = confidence, raw_text

    if by_value:
        ranked = sorted(
            by_value.items(),
            key=lambda kv: (-len(kv[1]["fracs"]), -kv[1]["max_conf"]),
        )
        top_value, top_data = ranked[0]
        top_frac_count = len(top_data["fracs"])
        second_frac_count = len(ranked[1][1]["fracs"]) if len(ranked) > 1 else 0
        strong = (
            top_value != 0
            and top_frac_count > second_frac_count
            and (
                top_frac_count >= 3
                or (
                    top_frac_count >= 2
                    and top_data["max_conf"] >= _NO_DET_STRONG_CONFIDENCE
                    and any(frac >= 0.60 for frac in top_data["fracs"])
                )
            )
        )
        if strong:
            return top_data["best_rt"], top_data["max_conf"], top_value

    candidates: list[tuple[int, float, str]] = []
    det_first_rt, det_first_cf = "", 0.0
    for frac in _QTY_CROP_FRACS:
        region = canvas[y + int(eff_h * frac) : y + eff_h, x : x + w]
        if region.size == 0:
            continue
        for variant in (region, _prepare_qty_ocr_image(region)):
            rt, cf = ocr_digits(variant, use_text_det=True)
            if not det_first_rt:
                det_first_rt, det_first_cf = rt, cf
            q = parse_ocr_result(rt, cf)
            if q is not None:
                candidates.append((q, cf, rt))

    if not candidates:
        return det_first_rt or first_rt, det_first_cf or first_cf, None

    grouped: dict[int, list[tuple[float, str]]] = {}
    for value, cf, rt in candidates:
        grouped.setdefault(value, []).append((cf, rt))

    chosen = max(
        grouped,
        key=lambda v: (
            len(grouped[v]),
            len(str(v)),
            max(cf for cf, _ in grouped[v]),
        ),
    )
    cf, rt = max(grouped[chosen], key=lambda item: item[0])
    return rt, cf, chosen


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
    candidates: list[tuple[int, float, str]] = []

    for x, y, w, h in _TOP_BAR_CURRENCY_OCR_REGIONS:
        if x >= canvas_w or y >= canvas_h:
            continue
        crop = canvas[y : min(y + h, canvas_h), x : min(x + w, canvas_w)]
        if crop.size == 0:
            continue
        for variant in (crop, _prepare_qty_ocr_image(crop)):
            rt, cf = ocr_digits(variant)
            value = parse_ocr_result(rt, cf)
            if value is not None:
                candidates.append((value, cf, rt))

    if not candidates:
        return None

    grouped: dict[int, list[tuple[float, str]]] = {}
    for value, cf, rt in candidates:
        grouped.setdefault(value, []).append((cf, rt))

    chosen = max(
        grouped,
        key=lambda v: (
            len(grouped[v]),
            len(str(v)),
            max(cf for cf, _ in grouped[v]),
        ),
    )
    cf, _rt = max(grouped[chosen], key=lambda item: item[0])
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
    canvas_h = canvas.shape[0]
    # edge_lattice augmentation can return undersized cells whose bbox ends
    # above the level/quantity text. Extend the OCR region down to the
    # P75 slot height (same trick operators / weapons routes use) so short
    # bboxes still capture the digit row.
    target_h = p75_height(list(slots))

    library = _load_library()
    items: list[dict] = []
    unknowns: list[dict] = []

    for bbox in slots:
        x, y, w, h = bbox
        icon_h = int(h * 0.7)
        icon = canvas[y : y + icon_h, x : x + w]

        eff_h = min(max(h, target_h), canvas_h - y)
        raw_text, conf, quantity = _ocr_inventory_quantity(canvas, x, y, w, eff_h)

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

    currency = _recognize_top_bar_currency(canvas)
    if currency is not None:
        items.append(currency)

    return {"items": items, "unknowns": unknowns}
