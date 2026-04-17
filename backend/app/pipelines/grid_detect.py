# backend/app/pipelines/grid_detect.py
from __future__ import annotations

import cv2
import numpy as np

# Aspect ratio tolerance: slots should be roughly square
_AR_MIN = 0.8
_AR_MAX = 1.25
_MIN_AREA = 40 * 40  # reject tiny contours
_MAX_AREA_RATIO = 0.25  # reject contours that span too much of the canvas

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
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
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
    return slots
