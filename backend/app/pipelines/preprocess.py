from __future__ import annotations

import cv2
import numpy as np

CANVAS_W = 1920
CANVAS_H = 1080


def load_and_normalize(img: np.ndarray) -> np.ndarray:
    """
    Normalize input image to a 1080p color canvas (BGR, 3-channel).

    Color is preserved so downstream matching can use hue to disambiguate
    structurally-identical items that only differ by tint (e.g., the three
    EXP 作战记录 tiers). If the input is single-channel, it is promoted to
    3-channel by replication. Scaling keeps aspect ratio so height = 1080
    for ≤16:9 inputs, else width = 1920.
    """
    if img.ndim == 2:
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    h, w = img.shape[:2]
    scale = min(CANVAS_H / h, CANVAS_W / w)
    new_w = int(round(w * scale))
    new_h = int(round(h * scale))
    return cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)
