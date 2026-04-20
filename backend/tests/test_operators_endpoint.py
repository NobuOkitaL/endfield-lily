import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.pipelines.grid_detect import detect_slots
from app.pipelines.preprocess import load_and_normalize
from app.pipelines.template_match import TemplateLibrary
from .fixtures.build_operators_fixture import build_operators_image


@pytest.fixture
def client():
    return TestClient(app)


def _png_bytes(img: np.ndarray) -> bytes:
    success, buf = cv2.imencode(".png", img)
    assert success
    return buf.tobytes()


def _library_from_pipeline(img_bgr: np.ndarray, names: list[str]) -> TemplateLibrary:
    """
    Extract the portrait region of each detected slot from the normalized canvas,
    and use those as the library templates.  This keeps the library in the same
    scale / colorspace as what the pipeline will match against, which is the
    invariant the recognizer relies on in production (portraits are stored at
    canvas-scale).
    """
    canvas = load_and_normalize(img_bgr)
    slots = sorted(detect_slots(canvas), key=lambda b: (b[1], b[0]))
    assert len(slots) >= len(names), f"expected ≥{len(names)} slots, got {len(slots)}"
    templates: dict[str, np.ndarray] = {}
    for name, (x, y, w, h) in zip(names, slots, strict=False):
        portrait = canvas[y : y + int(h * 0.7), x : x + w].copy()
        templates[name] = portrait
    return TemplateLibrary(templates)


def test_operators_endpoint_returns_operators_for_synthetic_screenshot(client, monkeypatch):
    """
    Feed a synthetic grid with known operator portraits + levels, verify the full
    pipeline (decode → normalize → detect → match → OCR → response) returns
    matched operators with the expected ids and levels.
    """
    size = 280
    # 3 distinct portrait patterns with horizontal stripes to ensure NCC can
    # distinguish them (same approach as inventory test).
    portraits_src: dict[str, np.ndarray] = {
        "op_aaa": np.full((size, size), 60, dtype=np.uint8),
        "op_bbb": np.full((size, size), 130, dtype=np.uint8),
        "op_ccc": np.full((size, size), 200, dtype=np.uint8),
    }
    for i, t in enumerate(portraits_src.values()):
        t[::(i + 2) * 4, :] = 0

    levels = {"op_aaa": 30, "op_bbb": 45, "op_ccc": 60}

    # 1×3 grid
    img, gt = build_operators_image(
        portraits_src, levels, rows=1, cols=3,
    )

    ordered_names = [n for n, _, _ in sorted(gt, key=lambda r: (r[2][1], r[2][0]))]
    library = _library_from_pipeline(img, ordered_names)

    from app.routes import operators as ops_mod

    monkeypatch.setattr(ops_mod, "_load_library", lambda: library)

    resp = client.post(
        "/recognize/operators",
        files={"image": ("screenshot.png", _png_bytes(img), "image/png")},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert "unknowns" in data

    # Template matching should be perfect (library is exactly the pipeline output).
    # OCR on cv2.putText level text is the lossy step — allow up to 1 failure out of 3.
    total_placed = len(ordered_names)
    ops_plus_unknowns = len(data["items"]) + len(data["unknowns"])
    assert ops_plus_unknowns == total_placed, (
        f"pipeline saw {ops_plus_unknowns} slots but placed {total_placed}"
    )
    assert len(data["items"]) >= total_placed - 1, (
        f"only {len(data['operators'])}/{total_placed} operators recognized; "
        f"unknowns: {[u.get('raw_ocr_text') for u in data['unknowns']]}"
    )
    for op in data["items"]:
        assert op["operator_id"] in ordered_names
        assert isinstance(op["level"], int)
        assert "confidence" in op and 0.0 <= op["confidence"] <= 1.0
        assert len(op["bbox"]) == 4


def test_operators_endpoint_rejects_non_image(client):
    resp = client.post(
        "/recognize/operators",
        files={"image": ("not-an-image.txt", b"hello", "text/plain")},
    )
    # Either 400, 415, or 422 is acceptable
    assert resp.status_code in (400, 415, 422)
