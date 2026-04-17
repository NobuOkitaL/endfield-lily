import numpy as np

from app.pipelines.template_match import TemplateLibrary, match_slot


def _make_template(size: int = 96, intensity: int = 180) -> np.ndarray:
    img = np.zeros((size, size), dtype=np.uint8)
    img[10:-10, 10:-10] = intensity
    return img


def _make_slot_with_template(template: np.ndarray, pad: int = 20, bg: int = 30) -> np.ndarray:
    """Embed template inside a larger slot region with canvas padding."""
    h, w = template.shape
    slot = np.full((h + pad * 2, w + pad * 2), bg, dtype=np.uint8)
    slot[pad : pad + h, pad : pad + w] = template
    return slot


def test_match_slot_identifies_correct_template():
    # Build a library of 3 distinct templates
    t1 = _make_template(intensity=180)
    t2 = _make_template(intensity=120)
    t3 = np.zeros((96, 96), dtype=np.uint8)
    t3[::8, :] = 255  # striped pattern

    lib = TemplateLibrary({"mat_a": t1, "mat_b": t2, "mat_c": t3})

    slot = _make_slot_with_template(t1)
    result = match_slot(slot, lib, threshold=0.8)
    assert result.material_id == "mat_a"
    assert result.confidence >= 0.8


def test_low_confidence_returns_unknown():
    t1 = _make_template(intensity=180)
    lib = TemplateLibrary({"mat_a": t1})

    # Random noise slot → should not match
    rng = np.random.default_rng(42)
    slot = rng.integers(0, 256, size=(140, 140), dtype=np.uint8)
    result = match_slot(slot, lib, threshold=0.8)
    assert result.material_id is None
    assert result.confidence < 0.8


def test_empty_library_returns_unknown():
    lib = TemplateLibrary({})
    slot = np.zeros((100, 100), dtype=np.uint8)
    result = match_slot(slot, lib, threshold=0.8)
    assert result.material_id is None
