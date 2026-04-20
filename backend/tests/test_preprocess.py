import numpy as np
import pytest
from app.pipelines.preprocess import load_and_normalize


def _make_rgb(w: int, h: int) -> np.ndarray:
    """Make a dummy RGB image."""
    img = np.zeros((h, w, 3), dtype=np.uint8)
    img[:, :, 1] = 100  # green tint
    return img


def test_normalize_to_1080p_canvas():
    src = _make_rgb(1920, 1080)
    canvas = load_and_normalize(src)
    assert canvas.shape == (1080, 1920, 3)  # BGR 3-channel
    assert canvas.dtype == np.uint8


def test_upscale_smaller_input():
    src = _make_rgb(960, 540)
    canvas = load_and_normalize(src)
    assert canvas.shape == (1080, 1920, 3)


def test_downscale_larger_input():
    src = _make_rgb(3840, 2160)
    canvas = load_and_normalize(src)
    assert canvas.shape == (1080, 1920, 3)


def test_non_16_9_input_returns_1080_height_preserving_aspect():
    # 2048×1536 (4:3) scaled keeping height=1080 → width=1440
    src = _make_rgb(2048, 1536)
    canvas = load_and_normalize(src)
    assert canvas.shape == (1080, 1440, 3)


def test_grayscale_input_promoted_to_bgr():
    src = np.full((540, 960), 120, dtype=np.uint8)
    canvas = load_and_normalize(src)
    assert canvas.shape == (1080, 1920, 3)
    # BGR channels should be equal (replicated from gray)
    assert (canvas[..., 0] == canvas[..., 1]).all()
    assert (canvas[..., 1] == canvas[..., 2]).all()
