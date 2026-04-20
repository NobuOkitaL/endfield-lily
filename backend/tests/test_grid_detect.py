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


def test_splits_oversized_merged_slot_into_subcells():
    """When Otsu merges adjacent slots into one super-blob (~2×2 the size of a
    normal slot), the merged bbox should be split into ~4 median-sized sub-
    slots so the underlying items aren't lost."""
    import numpy as np
    img, _ = make_grid(rows=4, cols=6, slot_size=120, gap=20)
    H, W = img.shape
    # Stamp a ~2×2 white super-blob in a region that doesn't overlap the grid.
    img[H - 280 : H - 20, W - 280 : W - 20] = 255
    slots = detect_slots(img)
    # No slot should leak through at super-blob size (~260×260).
    assert all(s[2] < 200 and s[3] < 200 for s in slots), (
        f"oversized merged slot leaked: {[s for s in slots if s[2]>=200 or s[3]>=200]}"
    )
    # Instead, at least 4 new sub-cells should appear in the super-blob's footprint.
    blob_x0, blob_y0, blob_x1, blob_y1 = W - 280, H - 280, W - 20, H - 20
    inside_blob = [
        s for s in slots
        if blob_x0 - 10 <= s[0] <= blob_x1 and blob_y0 - 10 <= s[1] <= blob_y1
    ]
    assert len(inside_blob) >= 4, (
        f"expected ≥4 sub-cells from 2×2 super-blob, got {len(inside_blob)}: {inside_blob}"
    )
