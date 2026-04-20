# backend/app/pipelines/grid_detect.py
from __future__ import annotations

import statistics

import cv2
import numpy as np

# Aspect ratio tolerance. Inventory slots are near-square (~1.0) while
# operator / weapon portrait cards are taller (~0.74). Widen the range to
# cover both layouts rather than requiring the caller to special-case.
_AR_MIN = 0.6
_AR_MAX = 1.5
_MIN_AREA = 40 * 40  # reject tiny contours
_MAX_AREA_RATIO = 0.25  # reject contours that span too much of the canvas

# Canvas brightness threshold for choosing thresholding direction. The
# inventory screen is dark (slots brighter than bg, mean ~50-80) but the
# operator / weapon rosters have light backgrounds (cards darker than bg,
# mean ~150). Mid-range values (~130) come from synthetic test fixtures
# with a balanced bright/dark mix — those should stay on the normal path.
_LIGHT_BG_MEAN = 145

# Median-based outlier handling. Only kicks in with ≥4 slots.
# - Oversized boxes (w/h > 1.4× median) are likely merged "super slots" from Otsu
#   gluing adjacent cards together; we split them into sub-cells sized at the
#   median so the underlying items aren't lost.
# - Undersized boxes (w/h < 0.6× median) are fragments; drop them.
_MEDIAN_OUTLIER_MIN_COUNT = 4
_MEDIAN_W_MAX = 1.4
_MEDIAN_W_MIN = 0.6


def _split_super_slot(
    bbox: "BBox", median_w: float, median_h: float
) -> list["BBox"]:
    """Split a merged super-slot into N×M sub-cells of median size. If the box
    isn't clearly a multi-cell merge (both dims round to 1 cell), return it
    unchanged."""
    x, y, w, h = bbox
    nc = max(1, round(w / median_w))
    nr = max(1, round(h / median_h))
    if nc <= 1 and nr <= 1:
        return [bbox]
    sw = w / nc
    sh = h / nr
    subs: list[BBox] = []
    for r in range(nr):
        for c in range(nc):
            cx = x + sw * (c + 0.5)
            cy = y + sh * (r + 0.5)
            sx = int(cx - median_w / 2)
            sy = int(cy - median_h / 2)
            subs.append((sx, sy, int(median_w), int(median_h)))
    return subs

BBox = tuple[int, int, int, int]


def detect_slots(img: np.ndarray) -> list[BBox]:
    """
    Detect grid slots as roughly-square regions brighter than the canvas.
    Returns list of (x, y, w, h) in image coordinates.
    """
    if img.ndim == 3:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    else:
        gray = img
    # On light-background screens (operator / weapon rosters) the cards are
    # darker than the bg — invert so the cards become the foreground blobs.
    thresh_type = cv2.THRESH_BINARY_INV if gray.mean() > _LIGHT_BG_MEAN else cv2.THRESH_BINARY
    _, binary = cv2.threshold(gray, 0, 255, thresh_type + cv2.THRESH_OTSU)
    # Close small gaps so each slot is a single contour
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    closed = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    canvas_area = gray.shape[0] * gray.shape[1]
    slots: list[BBox] = []
    for cnt in contours:
        x, y, w, h = cv2.boundingRect(cnt)
        area = w * h
        if area < _MIN_AREA:
            continue
        if area > canvas_area * _MAX_AREA_RATIO:
            continue
        ar = w / h if h > 0 else 0
        if ar < _AR_MIN or ar > _AR_MAX:
            continue
        slots.append((x, y, w, h))

    if len(slots) < _MEDIAN_OUTLIER_MIN_COUNT:
        return slots

    median_w = statistics.median(s[2] for s in slots)
    median_h = statistics.median(s[3] for s in slots)

    kept: list[BBox] = []
    oversized: list[BBox] = []
    for s in slots:
        w, h = s[2], s[3]
        if w < _MEDIAN_W_MIN * median_w or h < _MEDIAN_W_MIN * median_h:
            continue
        if w > _MEDIAN_W_MAX * median_w or h > _MEDIAN_W_MAX * median_h:
            oversized.append(s)
        else:
            kept.append(s)

    # Prefer directly-detected slots. Only append split sub-cells whose centers
    # are far enough from any already-kept slot (half-median cell pitch).
    dedup_threshold = 0.5 * min(median_w, median_h)

    def _center(b: BBox) -> tuple[float, float]:
        return b[0] + b[2] / 2, b[1] + b[3] / 2

    for s in oversized:
        for sub in _split_super_slot(s, median_w, median_h):
            scx, scy = _center(sub)
            overlap = any(
                abs(scx - kcx) < dedup_threshold and abs(scy - kcy) < dedup_threshold
                for kcx, kcy in (_center(k) for k in kept)
            )
            if not overlap:
                kept.append(sub)

    return kept


def p75_height(slots: list[BBox]) -> int:
    """Return the 75th-percentile height of *slots*. Callers use this to
    extend OCR regions downward on operator / weapon cards where Otsu
    sometimes crops the bbox at the portrait/rarity-strip boundary, losing
    the "Lv.XX" text. We use P75 instead of median because UI chrome on
    those pages gets detected as short "slots" that would pull the median
    down below the real card height."""
    if not slots:
        return 0
    heights_sorted = sorted(h for (_, _, _, h) in slots)
    idx = min(len(heights_sorted) - 1, int(len(heights_sorted) * 0.75))
    return heights_sorted[idx]
