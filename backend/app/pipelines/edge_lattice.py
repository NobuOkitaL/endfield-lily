# backend/app/pipelines/edge_lattice.py
"""Edge-lattice augmentation for grid_detect.

Otsu-based detection finds *foreground item silhouettes* inside cards, not
card boundaries. On low-contrast screens like 武陵仓库 (translucent light
panel + medium-tone cards) the top row of bright crystals and a fully-merged
bottom row never appear as distinct contours. Canny edges, by contrast, fire
on the card-frame transition itself; projecting them onto x/y axes recovers
the periodic grid even where Otsu can't see the cards.

Used as a post-pass: baseline Otsu gives us seed boxes that localize each
inventory panel and estimate the card pitch. We then re-segment that ROI
from the edge map and only swap to the lattice result when it materially
beats baseline (see ``select_better`` for the gating).
"""
from __future__ import annotations

import cv2
import numpy as np

BBox = tuple[int, int, int, int]


# Below this seed count in a panel cluster, periodicity estimation is too
# noisy to trust. 4 lets us recover a 2×2 minimum without false positives.
_MIN_SEEDS_PER_GROUP = 4

# Vertical band where inventory dialogs live. Filters out top/bottom UI
# chrome (header bar, footer toolbar) before we cluster seeds into panels.
_CONTENT_Y_MIN_RATIO = 0.16
_CONTENT_Y_MAX_RATIO = 0.76

# Pitch estimation: only treat differences in this range as plausible
# card-to-card distances. Outside it, a "pitch" is either two cards in the
# same column (small diff) or a panel jump (large diff).
_PITCH_LO = 55.0
_PITCH_HI = 150.0

# Per-cell occupancy thresholds. A predicted lattice cell counts as a real
# card if any of these signals fire on its inset ROI:
_OCCUPIED_EDGE_DENSITY = 0.035
_OCCUPIED_SAT_P90 = 58.0
_OCCUPIED_GRAY_STD = 18.0


def _center(box: BBox) -> tuple[float, float]:
    x, y, w, h = box
    return x + w / 2, y + h / 2


def _dedupe_boxes(boxes: list[BBox]) -> list[BBox]:
    """Drop near-duplicates by center proximity (35% of the smaller box dim)."""
    if not boxes:
        return []
    boxes = sorted(boxes, key=lambda b: b[2] * b[3], reverse=True)
    kept: list[BBox] = []
    for box in boxes:
        cx, cy = _center(box)
        duplicate = False
        for existing in kept:
            ex, ey = _center(existing)
            tol = 0.35 * min(existing[2], existing[3], box[2], box[3])
            if abs(cx - ex) <= tol and abs(cy - ey) <= tol:
                duplicate = True
                break
        if not duplicate:
            kept.append(box)
    return sorted(kept, key=lambda b: (b[1], b[0]))


def _cluster_1d(values: list[float], tolerance: float) -> list[float]:
    if not values:
        return []
    clusters: list[list[float]] = [[v] for v in sorted(values)]
    merged: list[list[float]] = []
    for cluster in clusters:
        if not merged or cluster[0] - (sum(merged[-1]) / len(merged[-1])) > tolerance:
            merged.append(cluster)
        else:
            merged[-1].extend(cluster)
    return [sum(c) / len(c) for c in merged]


def _estimate_pitch(values: list[float], tolerance: float) -> float | None:
    centers = _cluster_1d(values, tolerance)
    diffs = [b - a for a, b in zip(centers, centers[1:]) if _PITCH_LO <= b - a <= _PITCH_HI]
    if not diffs:
        return None
    diffs = sorted(diffs)
    return float(diffs[len(diffs) // 2])


def _seed_groups(seeds: list[BBox], shape: tuple[int, int]) -> list[list[BBox]]:
    """Cluster seeds by x-position into per-panel groups."""
    h, _w = shape
    content = [
        b for b in seeds
        if _CONTENT_Y_MIN_RATIO * h <= _center(b)[1] <= _CONTENT_Y_MAX_RATIO * h
    ]
    if len(content) < _MIN_SEEDS_PER_GROUP:
        return []
    xs = [_center(b)[0] for b in content]
    pitch = _estimate_pitch(xs, tolerance=35) or 105.0
    content = sorted(content, key=lambda b: _center(b)[0])
    groups: list[list[BBox]] = [[content[0]]]
    for box in content[1:]:
        gap = _center(box)[0] - _center(groups[-1][-1])[0]
        if gap > max(1.55 * pitch, 145):
            groups.append([box])
        else:
            groups[-1].append(box)
    return [g for g in groups if len(g) >= _MIN_SEEDS_PER_GROUP]


def _projection_peaks(
    projection: np.ndarray, offset: int, min_distance: int
) -> list[tuple[int, float]]:
    """Greedy non-max suppression on a 1D projection. Floor = 18% of max."""
    work = projection.astype(np.float32).copy()
    peaks: list[tuple[int, float]] = []
    floor = max(10.0, float(work.max()) * 0.18)
    while True:
        idx = int(work.argmax())
        value = float(work[idx])
        if value < floor:
            break
        peaks.append((offset + idx, value))
        lo = max(0, idx - min_distance)
        hi = min(len(work), idx + min_distance + 1)
        work[lo:hi] = 0
    return sorted(peaks)


def _regular_boundaries(
    peaks: list[tuple[int, float]],
    start: float,
    end: float,
    pitch: float,
    max_count: int,
) -> list[int]:
    """Pick the equispaced sequence at ~pitch that explains the most peaks.

    Edge projections produce extra peaks at item silhouettes inside cards;
    fitting a regular sequence (allowing ±6% pitch wobble) snaps to actual
    card boundaries and ignores intra-card noise.
    """
    if not peaks or pitch <= 0:
        return []
    peak_positions = [p for p, _ in peaks]
    peak_weights = {p: w for p, w in peaks}
    tolerance = max(7.0, pitch * 0.10)
    best_score = -1.0
    best: list[int] = []
    for first_peak in peak_positions:
        first = float(first_peak)
        while first - pitch >= start - tolerance:
            first -= pitch
        for pitch_scale in (0.94, 0.97, 1.0, 1.03, 1.06):
            p = pitch * pitch_scale
            seq: list[int] = []
            value = first
            while value <= end + tolerance and len(seq) <= max_count:
                seq.append(int(round(value)))
                value += p
            if len(seq) < 2:
                continue
            hits = 0
            weight = 0.0
            for boundary in seq:
                near = [pos for pos in peak_positions if abs(pos - boundary) <= tolerance]
                if near:
                    closest = min(near, key=lambda pos: abs(pos - boundary))
                    hits += 1
                    weight += peak_weights[closest]
            coverage_penalty = abs(seq[0] - start) * 0.02 + abs(seq[-1] - end) * 0.02
            score = hits * 1000.0 + weight - coverage_penalty
            if score > best_score:
                best_score = score
                best = seq
    return best


def _cell_is_occupied(
    cell: BBox,
    seeds: list[BBox],
    edges: np.ndarray,
    sat: np.ndarray,
    gray: np.ndarray,
) -> bool:
    """A predicted cell counts as a real card if a seed lies inside it OR
    its inset ROI shows enough edge density / saturation / gray variance.
    Inset by 18% to ignore frame-line peaks at the cell border."""
    x, y, w, h = cell
    for seed in seeds:
        sx, sy = _center(seed)
        if x <= sx <= x + w and y <= sy <= y + h:
            return True
    ix = int(round(w * 0.18))
    iy = int(round(h * 0.18))
    if w - 2 * ix < 12 or h - 2 * iy < 12:
        return False
    roi = np.s_[y + iy : y + h - iy, x + ix : x + w - ix]
    area = max(1, (h - 2 * iy) * (w - 2 * ix))
    edge_density = float((edges[roi] > 0).sum()) / area
    sat_p90 = float(np.percentile(sat[roi], 90))
    gray_std = float(gray[roi].std())
    return (
        edge_density > _OCCUPIED_EDGE_DENSITY
        or sat_p90 > _OCCUPIED_SAT_P90
        or gray_std > _OCCUPIED_GRAY_STD
    )


def detect_slots_edge_lattice(img: np.ndarray, seed_slots: list[BBox]) -> list[BBox]:
    """Infer slots from grid-line periodicity, using Otsu boxes as seeds."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img
    if img.ndim == 3:
        sat = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)[:, :, 1]
    else:
        sat = np.zeros_like(gray)
    edges = cv2.Canny(cv2.GaussianBlur(gray, (3, 3), 0), 50, 120)
    cells: list[BBox] = []
    for group in _seed_groups(seed_slots, gray.shape[:2]):
        centers_x = [_center(b)[0] for b in group]
        centers_y = [_center(b)[1] for b in group]
        pitch_x = _estimate_pitch(centers_x, tolerance=35)
        pitch_y = _estimate_pitch(centers_y, tolerance=35)
        if pitch_x is None or pitch_y is None:
            continue
        # Wider left expansion when the seed cluster already spans many
        # columns — those panels likely have rows we missed entirely; narrow
        # expansion when we only have a few seeds keeps us from inventing
        # cells outside the real panel.
        detected_cols = len(_cluster_1d(centers_x, tolerance=35))
        left_expand = 1.55 if detected_cols >= 6 else 0.65
        x1 = max(0, int(min(centers_x) - left_expand * pitch_x))
        x2 = min(gray.shape[1] - 1, int(max(centers_x) + 0.70 * pitch_x))
        y1 = max(0, int(min(centers_y) - 0.70 * pitch_y))
        y2 = min(gray.shape[0] - 1, int(max(centers_y) + 0.70 * pitch_y))
        roi_edges = edges[y1:y2, x1:x2]
        x_peaks = _projection_peaks(
            roi_edges.sum(axis=0) / 255, x1, int(max(12, pitch_x * 0.28))
        )
        y_peaks = _projection_peaks(
            roi_edges.sum(axis=1) / 255, y1, int(max(10, pitch_y * 0.25))
        )
        xb = _regular_boundaries(x_peaks, x1, x2, pitch_x, max_count=14)
        yb = _regular_boundaries(y_peaks, y1, y2, pitch_y, max_count=8)
        if len(xb) < 2 or len(yb) < 2:
            continue
        for top, bottom in zip(yb, yb[1:]):
            for left, right in zip(xb, xb[1:]):
                cell = (left, top, right - left, bottom - top)
                if cell[2] < 45 or cell[3] < 45:
                    continue
                if _cell_is_occupied(cell, group, edges, sat, gray):
                    cells.append(cell)
    return _dedupe_boxes(cells)


# Selection gate: only swap to lattice when it finds *materially* more
# cells than baseline (≥ +10) and stays within a plausible inventory size
# (≤ 56). Guards against edge_lattice firing on unrelated UI screens.
_AUGMENT_MIN_GAIN = 10
_AUGMENT_MAX_TOTAL = 56


def select_better(baseline: list[BBox], lattice: list[BBox]) -> list[BBox]:
    """Pick lattice over baseline only when it's a clear, plausible win."""
    if (
        len(lattice) >= len(baseline) + _AUGMENT_MIN_GAIN
        and len(lattice) <= _AUGMENT_MAX_TOTAL
    ):
        return lattice
    return baseline
