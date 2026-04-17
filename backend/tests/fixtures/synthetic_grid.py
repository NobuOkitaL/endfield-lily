"""Generate synthetic grid images for unit tests."""
from __future__ import annotations

import numpy as np


def make_grid(
    rows: int = 4,
    cols: int = 6,
    slot_size: int = 128,
    gap: int = 24,
    border: int = 40,
    canvas_color: int = 20,
    slot_color: int = 200,
) -> tuple[np.ndarray, list[tuple[int, int, int, int]]]:
    """
    Create a grayscale image with a regular grid of light-colored square slots
    on a dark canvas. Returns (image, bboxes) where bboxes are (x, y, w, h).
    """
    w = border * 2 + cols * slot_size + (cols - 1) * gap
    h = border * 2 + rows * slot_size + (rows - 1) * gap
    img = np.full((h, w), canvas_color, dtype=np.uint8)
    bboxes: list[tuple[int, int, int, int]] = []
    for r in range(rows):
        for c in range(cols):
            x = border + c * (slot_size + gap)
            y = border + r * (slot_size + gap)
            img[y : y + slot_size, x : x + slot_size] = slot_color
            bboxes.append((x, y, slot_size, slot_size))
    return img, bboxes
