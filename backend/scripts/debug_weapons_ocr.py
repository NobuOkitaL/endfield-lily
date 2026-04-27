"""One-shot diagnostic for the weapons-recognition OCR level pipeline.

Loads /Users/nobuokita/Downloads/IMG_9589.PNG, walks the same pipeline that
``app.routes.weapons.recognize_weapons`` uses (load_and_normalize →
detect_slots(close_kernel=5) → multi-crop OCR per slot), and prints (a) what
``ocr_digits`` / ``parse_ocr_result`` decide, and (b) what the *raw* RapidOCR
detections actually look like below the aggregator.

Outputs:
  - stdout: per-slot table sorted by (y, x) plus a per-slot detail dump
  - /tmp/weapons_ocr/canvas_annotated.png: canvas with bbox + slot_idx
  - /tmp/weapons_ocr/slot_<idx>.png: the widest crop (crop_frac=0.40) fed to OCR

Does NOT modify any pipeline file. Pure read-only diagnostic.
"""
from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

# Make sure we can import `app.*` regardless of cwd.
_BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from app.pipelines.grid_detect import detect_slots, p75_height  # noqa: E402
from app.pipelines.ocr import (  # noqa: E402
    PARSEABLE_CONFIDENCE_FLOOR,
    _get_engine,
    ocr_digits,
    parse_quantity_string,
)
from app.pipelines.preprocess import load_and_normalize  # noqa: E402
from app.routes.weapons import (  # noqa: E402
    _WEAPON_LEVEL_CROP_FRACS,
    _choose_weapon_level,
    _filter_weapon_grid_slots,
    _parse_weapon_level,
    _prepare_weapon_level_ocr_image,
    _strip_lv_prefix,
)

IMAGE_PATH = Path("/Users/nobuokita/Downloads/IMG_9589.PNG")
OUT_DIR = Path("/tmp/weapons_ocr")
OUT_DIR.mkdir(parents=True, exist_ok=True)

CROP_FRACS = _WEAPON_LEVEL_CROP_FRACS
EXPECTED_LEVELS = [
    90,
    90,
    90,
    90,
    80,
    80,
    80,
    80,
    80,
    80,
    80,
    20,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    80,
    20,
    20,
    1,
    1,
    1,
]


def _decode_image(path: Path) -> np.ndarray:
    pil = Image.open(path).convert("RGB")
    arr = np.array(pil)
    return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)


def _raw_detections(region: np.ndarray) -> list[dict]:
    """Call RapidOCR directly with the same params ocr_digits uses, but
    surface every detection (not just the aggregator's pick)."""
    engine = _get_engine()
    result, _elapse = engine(
        region, text_score=0.1, box_thresh=0.1, unclip_ratio=3.0
    )
    if not result:
        return []
    out: list[dict] = []
    for box, text, conf_str in result:
        try:
            conf = float(conf_str)
        except (ValueError, TypeError):
            conf = 0.0
        # Box is a 4-point polygon (list of [x,y]); reduce to bbox for printing.
        try:
            xs = [int(p[0]) for p in box]
            ys = [int(p[1]) for p in box]
            bx = (min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys))
        except Exception:
            bx = None
        out.append({"box": bx, "text": text, "conf": conf})
    return out


def _save_canvas_annotated(canvas: np.ndarray, slots_sorted: list[tuple[int, tuple]]) -> None:
    annotated = canvas.copy()
    for idx, (x, y, w, h) in slots_sorted:
        cv2.rectangle(annotated, (x, y), (x + w, y + h), (0, 255, 0), 2)
        cv2.putText(
            annotated,
            str(idx),
            (x + 4, y + 22),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (0, 0, 255),
            2,
            cv2.LINE_AA,
        )
    cv2.imwrite(str(OUT_DIR / "canvas_annotated.png"), annotated)


def _classify_failure(
    raw_per_crop: dict[float, list[dict]],
    parses_per_crop: dict[float, tuple[str, float, str, int | None]],
) -> str:
    """Categorize *why* a slot ended up with no level. Order matters — first
    matching reason wins.

    Categories:
      - "no_detection_any_crop"    : engine returned [] for every crop frac
      - "no_digit_detection"       : at least one detection but none contains digits
      - "digit_below_floor"        : digit detection exists but conf < PARSEABLE_CONFIDENCE_FLOOR
      - "parse_returned_zero_or_neg": parse result is 0 / negative / None despite digits
      - "parsed_but_filtered"      : parsed value > 0 but candidate filter dropped it (shouldn't happen)
    """
    any_detection = any(len(v) > 0 for v in raw_per_crop.values())
    if not any_detection:
        return "no_detection_any_crop"
    any_digit = any(
        any(any(c.isdigit() for c in d["text"]) for d in v)
        for v in raw_per_crop.values()
    )
    if not any_digit:
        return "no_digit_detection"
    # If we have digit detections, check whether at least one passed conf floor
    digit_above_floor = False
    digit_parsed_positive = False
    for v in raw_per_crop.values():
        for d in v:
            if any(c.isdigit() for c in d["text"]):
                if d["conf"] >= PARSEABLE_CONFIDENCE_FLOOR:
                    digit_above_floor = True
                # Also check what parse_quantity_string makes of it
                stripped = _strip_lv_prefix(d["text"])
                p = parse_quantity_string(stripped)
                if p is not None and p > 0:
                    digit_parsed_positive = True
    if not digit_above_floor:
        return "digit_below_floor"
    if not digit_parsed_positive:
        return "parse_returned_zero_or_neg"
    return "parsed_but_filtered"


def main() -> None:
    if not IMAGE_PATH.exists():
        print(f"!! image not found: {IMAGE_PATH}")
        sys.exit(1)
    print(f"loading {IMAGE_PATH} ...")
    bgr = _decode_image(IMAGE_PATH)
    canvas = load_and_normalize(bgr)
    canvas_h, canvas_w = canvas.shape[:2]
    print(f"canvas: {canvas_w}x{canvas_h}")

    raw_slots = detect_slots(canvas, close_kernel=5)
    slots = _filter_weapon_grid_slots(raw_slots, canvas_w)
    print(f"detected slots: {len(raw_slots)} raw → {len(slots)} weapon-grid")
    if not slots:
        print("!! no slots — aborting")
        sys.exit(2)

    target_h = p75_height(list(slots))
    print(f"p75_height (target_h): {target_h}")

    # Sort by (y, x) so output reads row-by-row, left-to-right.
    sorted_pairs = sorted(enumerate(slots), key=lambda kv: (kv[1][1], kv[1][0]))
    # Re-index after sort so slot_idx matches the visual reading order.
    slots_sorted: list[tuple[int, tuple]] = [
        (i, bbox) for i, (_, bbox) in enumerate(sorted_pairs)
    ]

    _save_canvas_annotated(canvas, slots_sorted)

    rows: list[dict] = []
    for slot_idx, bbox in slots_sorted:
        x, y, w, h = bbox
        eff_h = min(max(h, target_h), canvas_h - y)

        raw_per_crop: dict[float, list[dict]] = {}
        parses_per_crop: dict[float, tuple[str, float, str, int | None]] = {}
        candidates: list[tuple[int, float, str]] = []
        first_rt, first_cf = "", 0.0
        for cf in CROP_FRACS:
            top = y + int(eff_h * cf)
            bot = y + eff_h
            left = x
            right = x + w
            region = canvas[top:bot, left:right]
            if region.size == 0:
                raw_per_crop[cf] = []
                parses_per_crop[cf] = ("", 0.0, "", None)
                continue
            raws = _raw_detections(region)
            prepared = _prepare_weapon_level_ocr_image(region)
            rt, conf = ocr_digits(prepared)
            stripped = _strip_lv_prefix(rt)
            lv = _parse_weapon_level(rt, conf)
            raw_per_crop[cf] = raws
            parses_per_crop[cf] = (rt, conf, stripped, lv)
            if not first_rt:
                first_rt, first_cf = rt, conf
            if lv is not None:
                candidates.append((lv, conf, rt))

        selected_raw, selected_conf, level = _choose_weapon_level(candidates)
        if level is None:
            selected_raw, selected_conf = first_rt, first_cf

        # Save the widest crop (smallest crop_frac).
        widest_top = y + int(eff_h * min(CROP_FRACS))
        widest = canvas[widest_top : y + eff_h, x : x + w]
        if widest.size > 0:
            cv2.imwrite(str(OUT_DIR / f"slot_{slot_idx:02d}.png"), widest)

        reason = ""
        if level is None or level == 0:
            reason = _classify_failure(raw_per_crop, parses_per_crop)
        expected = EXPECTED_LEVELS[slot_idx] if slot_idx < len(EXPECTED_LEVELS) else None

        rows.append(
            {
                "idx": slot_idx,
                "bbox": (x, y, w, h),
                "level": level,
                "expected": expected,
                "selected_raw": selected_raw,
                "selected_conf": selected_conf,
                "reason": reason,
                "raw_per_crop": raw_per_crop,
                "parses_per_crop": parses_per_crop,
            }
        )

    # ------------------------------------------------------------------
    # Summary table
    # ------------------------------------------------------------------
    print()
    print("=" * 100)
    print("SUMMARY (sorted by y,x — reading order)")
    print("=" * 100)
    print(
        f"{'idx':>3} | {'bbox (x,y,w,h)':<22} | {'level':>6} | "
        f"{'expect':>6} | reason_if_failed"
    )
    print("-" * 100)
    for r in rows:
        x, y, w, h = r["bbox"]
        bbox_str = f"({x},{y},{w},{h})"
        lvl_str = "—" if r["level"] is None else str(r["level"])
        exp_str = "—" if r["expected"] is None else str(r["expected"])
        print(
            f"{r['idx']:>3} | {bbox_str:<22} | {lvl_str:>6} | "
            f"{exp_str:>6} | {r['reason']}"
        )
    hits = sum(r["level"] == r["expected"] for r in rows)
    print(f"\nlevel hits: {hits}/{len(rows)}")

    # ------------------------------------------------------------------
    # Per-slot detail dump
    # ------------------------------------------------------------------
    print()
    print("=" * 100)
    print("PER-SLOT DETAIL")
    print("=" * 100)
    for r in rows:
        x, y, w, h = r["bbox"]
        print()
        print(
            f"### slot {r['idx']} bbox=({x},{y},{w},{h})  →  "
            f"level={r['level']} expected={r['expected']} "
            f"selected={r['selected_raw']!r}/{r['selected_conf']:.3f} "
            f"reason={r['reason']}"
        )
        for cf in CROP_FRACS:
            raws = r["raw_per_crop"][cf]
            rt, conf, stripped, lv = r["parses_per_crop"][cf]
            print(
                f"  crop_frac={cf:.2f}  agg_text={rt!r}  conf={conf:.3f}  "
                f"stripped={stripped!r}  parse_ocr_result={lv}"
            )
            if not raws:
                print("    raw detections: (none)")
            else:
                for d in raws:
                    print(
                        f"    raw: box={d['box']}  text={d['text']!r}  conf={d['conf']:.3f}"
                    )

    # ------------------------------------------------------------------
    # Aggregate failure reasons
    # ------------------------------------------------------------------
    print()
    print("=" * 100)
    print("FAILURE REASON FREQUENCY (level == None or 0)")
    print("=" * 100)
    from collections import Counter
    counter = Counter(r["reason"] for r in rows if r["reason"])
    for reason, n in counter.most_common():
        print(f"  {n:>3}  {reason}")
    print()
    print(f"output dir: {OUT_DIR}")


if __name__ == "__main__":
    main()
