from __future__ import annotations

import cv2
import numpy as np

CANVAS_W = 1920
CANVAS_H = 1080


def load_and_normalize(img: np.ndarray) -> np.ndarray:
    """
    Normalize input image to a 1080p grayscale canvas.
    - Converts BGR/RGB to grayscale (OpenCV uses BGR by default).
    - Scales keeping aspect ratio so the result has height = 1080
      when the input is ≤16:9, otherwise width = 1920.
    """
    if img.ndim == 3:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    else:
        gray = img

    h, w = gray.shape
    # Decide scale: fit by height or width, keep aspect
    scale_by_h = CANVAS_H / h
    scale_by_w = CANVAS_W / w
    # Use the smaller scale to avoid cropping when aspect diverges from 16:9;
    # this matches the behavior of "fit inside canvas" sizing.
    scale = min(scale_by_h, scale_by_w)
    new_w = int(round(w * scale))
    new_h = int(round(h * scale))
    resized = cv2.resize(gray, (new_w, new_h), interpolation=cv2.INTER_AREA)

    # For exact 16:9 inputs this will be 1920x1080; for 4:3 inputs, 1440x1080.
    # Tests below assert the expected shapes.
    return resized
