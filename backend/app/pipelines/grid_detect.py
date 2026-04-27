# backend/app/pipelines/grid_detect.py
from __future__ import annotations

import statistics

import cv2
import numpy as np

from app.pipelines.edge_lattice import detect_slots_edge_lattice, select_better

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
# - Oversized boxes (w/h > 1.9× median) are merged "super slots" from Otsu
#   gluing adjacent cards; split them into sub-cells sized at the median.
# - Undersized boxes (w/h < 0.6× median) are fragments; drop them.
# - 1.9× (not 1.4×) so screens with two grid regions of different slot sizes
#   (e.g. 武陵仓库 main grid 68px + 背包 panel 98px, ratio 1.44) both pass.
#   Real super-slots are ≥2× in a dimension — the 1.9 ceiling still catches
#   those while tolerating dual-grid screens.
_MEDIAN_OUTLIER_MIN_COUNT = 4
_MEDIAN_W_MAX = 1.9
_MEDIAN_W_MIN = 0.6

# Split-validity bounds for `_split_super_slot`. When Otsu glues adjacent
# cards into one oversized blob, ``round(w/median)`` / ``round(h/median)``
# tells us the presumed cell count. But we must distinguish *real* grid
# merges (where ratios are near integers like 2.0, 2.2) from *non-grid*
# blobs that happen to be big — e.g. the in-game 3D scene visible outside
# an open dialog on 武陵仓库 can produce a single huge contour whose ratios
# are 3.4 / 4.4 and have no internal grid structure. Splitting such a blob
# fabricates N×M ghost sub-cells that pollute the result.
#
# Rules:
#   - ``_SPLIT_MAX_RATIO``: ratios above this (>3 along either axis) are not
#     legitimate grid merges — drop the blob. Real merges are typically 2×N
#     or N×2 because cards that far apart aren't in the same connected blob.
#   - ``_SPLIT_RATIO_TOLERANCE``: fractional deviation between the float
#     ratio and the rounded integer cell count. 0.35 admits the common
#     ~2.33 ratio (see test_splits_oversized_merged_slot_into_subcells where
#     Otsu+close grows a 260px blob to 280px on a 120px median = 2.33) while
#     still rejecting the 3.4/4.4 case.
_SPLIT_MAX_RATIO = 3.0
_SPLIT_RATIO_TOLERANCE = 0.35


def _split_super_slot(
    bbox: "BBox", median_w: float, median_h: float
) -> list["BBox"]:
    """Split a merged super-slot into N×M sub-cells of median size.

    Guards against false splits on non-grid blobs (e.g. game-world region
    visible outside an open dialog on 武陵仓库): requires both ratios to be
    bounded (≤ ``_SPLIT_MAX_RATIO``) and at least one dimension to be a
    near-integer multiple of the median cell pitch
    (``±_SPLIT_RATIO_TOLERANCE``). Blobs failing either test return ``[]``
    so they're discarded rather than materialized as N×M ghost sub-cells.

    If the rounded cell count is 1×1, the original bbox is returned.
    """
    x, y, w, h = bbox
    nc_f = w / median_w
    nr_f = h / median_h
    nc = max(1, round(nc_f))
    nr = max(1, round(nr_f))
    if nc <= 1 and nr <= 1:
        return [bbox]
    # Reject blobs too large in either dimension to plausibly be a merged
    # grid of cells — they're almost certainly non-grid content.
    if nc_f > _SPLIT_MAX_RATIO or nr_f > _SPLIT_MAX_RATIO:
        return []
    # Require at least one dimension to be a clean near-integer multiple.
    col_clean = abs(nc - nc_f) <= _SPLIT_RATIO_TOLERANCE
    row_clean = abs(nr - nr_f) <= _SPLIT_RATIO_TOLERANCE
    if not (col_clean or row_clean):
        return []
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


def detect_slots(img: np.ndarray, close_kernel: int = 5) -> list[BBox]:
    """
    Detect grid slots as roughly-square regions brighter than the canvas.
    Returns list of (x, y, w, h) in image coordinates.

    ``close_kernel`` picks the size of the MORPH_CLOSE structuring element. The
    caller chooses: 7 for small-slot screens like 武陵仓库 (≈68px slots), 5 for
    larger cards like operators / weapons which were labelled at that geometry
    (changing the kernel changes the detected bbox size, invalidating existing
    labeled template captures). Default 5 preserves legacy behavior.

    On low-contrast dual-panel screens (e.g. 武陵仓库) Otsu detects item
    silhouettes inside cards but misses the cards themselves where the panel /
    card gray gap is small. After the Otsu pass we try an edge-projection
    lattice that uses the Otsu seeds to localize panels and re-segment from
    Canny edges; ``select_better`` only swaps in the lattice result when it's
    a clear, plausible improvement.
    """
    baseline = _baseline_detect(img, close_kernel)
    lattice = detect_slots_edge_lattice(img, baseline)
    return select_better(baseline, lattice)


def _baseline_detect(img: np.ndarray, close_kernel: int) -> list[BBox]:
    if img.ndim == 3:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    else:
        gray = img
    # On light-background screens (operator / weapon rosters) the cards are
    # darker than the bg — invert so the cards become the foreground blobs.
    thresh_type = cv2.THRESH_BINARY_INV if gray.mean() > _LIGHT_BG_MEAN else cv2.THRESH_BINARY
    _, binary = cv2.threshold(gray, 0, 255, thresh_type + cv2.THRESH_OTSU)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (close_kernel, close_kernel))
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
