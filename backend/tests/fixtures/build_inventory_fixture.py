"""Build a synthetic inventory screenshot for integration tests."""
from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np


def build_inventory_image(
    templates: dict[str, np.ndarray],
    quantities: dict[str, int],
    rows: int = 3,
    cols: int = 5,
) -> tuple[np.ndarray, list[tuple[str, int, tuple[int, int, int, int]]]]:
    """
    Tile templates + rendered digits into a grid. Returns (image, ground_truth).
    ground_truth is [(name, quantity, bbox)].
    """
    slot_size = 200
    gap = 24
    border = 48
    w = border * 2 + cols * slot_size + (cols - 1) * gap
    h = border * 2 + rows * slot_size + (rows - 1) * gap
    img = np.full((h, w, 3), 30, dtype=np.uint8)

    gt = []
    names = list(templates.keys())[: rows * cols]
    for i, name in enumerate(names):
        r = i // cols
        c = i % cols
        x = border + c * (slot_size + gap)
        y = border + r * (slot_size + gap)
        # Slot background
        cv2.rectangle(img, (x, y), (x + slot_size, y + slot_size), (200, 200, 200), -1)
        # Paste template (scaled to fit upper 70%)
        tpl = templates[name]
        tpl_h = int(slot_size * 0.7)
        tpl_w = tpl_h
        tpl_rs = cv2.resize(tpl, (tpl_w, tpl_h))
        if tpl_rs.ndim == 2:
            tpl_rs = cv2.cvtColor(tpl_rs, cv2.COLOR_GRAY2BGR)
        img[y + 10 : y + 10 + tpl_h, x + (slot_size - tpl_w) // 2 : x + (slot_size - tpl_w) // 2 + tpl_w] = tpl_rs
        # Draw quantity in lower-right
        q = quantities.get(name, 0)
        text = str(q)
        cv2.putText(
            img,
            text,
            (x + slot_size - 80, y + slot_size - 12),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.9,
            (0, 0, 0),
            2,
            cv2.LINE_AA,
        )
        gt.append((name, q, (x, y, slot_size, slot_size)))
    return img, gt


if __name__ == "__main__":
    # Quick visual check
    templates = {
        f"mat_{i:03d}": np.full((96, 96), 100 + i * 10, dtype=np.uint8) for i in range(6)
    }
    img, gt = build_inventory_image(
        templates,
        {n: i + 1 for i, (n, _, _) in enumerate([(k, 0, None) for k in templates])},
    )
    out = Path(__file__).parent / "synthetic_inventory.png"
    cv2.imwrite(str(out), img)
    print(f"Wrote {out} ({img.shape})")
