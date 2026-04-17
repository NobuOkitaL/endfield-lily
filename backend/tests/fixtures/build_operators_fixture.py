"""Build a synthetic operator screenshot for integration tests."""
from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np


def build_operators_image(
    portraits: dict[str, np.ndarray],
    levels: dict[str, int],
    rows: int = 1,
    cols: int = 3,
) -> tuple[np.ndarray, list[tuple[str, int, tuple[int, int, int, int]]]]:
    """
    Tile portrait images + rendered level text into a grid.
    Each card has portrait in upper 70% and "Lv.{n}" text in lower 30%.
    Returns (image, ground_truth) where ground_truth is [(op_id, level, bbox)].
    """
    slot_size = 200
    gap = 24
    border = 48
    w = border * 2 + cols * slot_size + (cols - 1) * gap
    h = border * 2 + rows * slot_size + (rows - 1) * gap
    img = np.full((h, w, 3), 30, dtype=np.uint8)

    gt = []
    names = list(portraits.keys())[: rows * cols]
    for i, name in enumerate(names):
        r = i // cols
        c = i % cols
        x = border + c * (slot_size + gap)
        y = border + r * (slot_size + gap)
        # Slot background (light gray)
        cv2.rectangle(img, (x, y), (x + slot_size, y + slot_size), (200, 200, 200), -1)
        # Paste portrait (scaled to fit upper 70%)
        portrait = portraits[name]
        portrait_h = int(slot_size * 0.7)
        portrait_w = portrait_h
        portrait_rs = cv2.resize(portrait, (portrait_w, portrait_h))
        if portrait_rs.ndim == 2:
            portrait_rs = cv2.cvtColor(portrait_rs, cv2.COLOR_GRAY2BGR)
        px = x + (slot_size - portrait_w) // 2
        py = y + 5
        img[py : py + portrait_h, px : px + portrait_w] = portrait_rs
        # Draw level text in lower 30% area: "Lv.{n}"
        lvl = levels.get(name, 1)
        text = f"Lv.{lvl}"
        # Place text in lower portion of card
        text_y = y + slot_size - 20
        text_x = x + 10
        cv2.putText(
            img,
            text,
            (text_x, text_y),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (0, 0, 0),
            2,
            cv2.LINE_AA,
        )
        gt.append((name, lvl, (x, y, slot_size, slot_size)))
    return img, gt


if __name__ == "__main__":
    # Quick visual check
    portraits = {
        f"op_{i:03d}": np.full((96, 96), 80 + i * 30, dtype=np.uint8) for i in range(3)
    }
    img, gt = build_operators_image(
        portraits,
        {n: (i + 1) * 10 for i, n in enumerate(portraits)},
    )
    out = Path(__file__).parent / "synthetic_operators.png"
    cv2.imwrite(str(out), img)
    print(f"Wrote {out} ({img.shape})")
