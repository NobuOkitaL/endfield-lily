from app.pipelines.grid_detect import detect_slots
from .fixtures.synthetic_grid import make_grid


def test_detects_all_slots_on_synthetic_grid():
    img, expected = make_grid(rows=4, cols=6)
    slots = detect_slots(img)
    assert len(slots) == 24


def test_slot_bboxes_approximately_match():
    img, expected = make_grid(rows=3, cols=5, slot_size=120, gap=20)
    slots = detect_slots(img)
    # Sort both by (y, x) for comparison
    got = sorted(slots, key=lambda b: (b[1], b[0]))
    want = sorted(expected, key=lambda b: (b[1], b[0]))
    assert len(got) == len(want)
    for g, w in zip(got, want, strict=True):
        # Allow ±4px tolerance on each edge for contour approximation
        assert abs(g[0] - w[0]) <= 4
        assert abs(g[1] - w[1]) <= 4
        assert abs(g[2] - w[2]) <= 6
        assert abs(g[3] - w[3]) <= 6


def test_returns_empty_on_blank_canvas():
    import numpy as np
    blank = np.full((500, 500), 30, dtype=np.uint8)
    assert detect_slots(blank) == []
