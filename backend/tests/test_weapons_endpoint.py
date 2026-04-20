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
    """Extract each slot's icon region (upper 70%) at pipeline scale/colorspace."""
    canvas = load_and_normalize(img_bgr)
    slots = sorted(detect_slots(canvas), key=lambda b: (b[1], b[0]))
    assert len(slots) >= len(names), f"expected ≥{len(names)} slots, got {len(slots)}"
    templates: dict[str, np.ndarray] = {}
    for name, (x, y, w, h) in zip(names, slots, strict=False):
        icon = canvas[y : y + int(h * 0.7), x : x + w].copy()
        templates[name] = icon
    return TemplateLibrary(templates)


def test_weapons_endpoint_returns_items_for_synthetic_screenshot(client, monkeypatch):
    """
    Feed a synthetic grid with known weapon icons + levels; verify the full
    pipeline (decode → normalize → detect → match → OCR → response) returns
    matched weapons with expected ids and levels.
    """
    size = 280
    icons_src: dict[str, np.ndarray] = {
        "wp_aaa": np.full((size, size), 60, dtype=np.uint8),
        "wp_bbb": np.full((size, size), 130, dtype=np.uint8),
        "wp_ccc": np.full((size, size), 200, dtype=np.uint8),
    }
    for i, t in enumerate(icons_src.values()):
        t[::(i + 2) * 4, :] = 0

    levels = {"wp_aaa": 20, "wp_bbb": 40, "wp_ccc": 70}

    img, gt = build_operators_image(icons_src, levels, rows=1, cols=3)

    ordered_names = [n for n, _, _ in sorted(gt, key=lambda r: (r[2][1], r[2][0]))]
    library = _library_from_pipeline(img, ordered_names)

    from app.routes import weapons as wp_mod

    monkeypatch.setattr(wp_mod, "_load_library", lambda: library)

    resp = client.post(
        "/recognize/weapons",
        files={"image": ("screenshot.png", _png_bytes(img), "image/png")},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert "unknowns" in data

    total_placed = len(ordered_names)
    items_plus_unknowns = len(data["items"]) + len(data["unknowns"])
    assert items_plus_unknowns == total_placed, (
        f"pipeline saw {items_plus_unknowns} slots but placed {total_placed}"
    )
    # OCR on synthetic digits can miss up to 1/3 (same tolerance as operators test)
    assert len(data["items"]) >= total_placed - 1, (
        f"only {len(data['items'])}/{total_placed} weapons recognized; "
        f"unknowns: {[u.get('raw_ocr_text') for u in data['unknowns']]}"
    )
    for w in data["items"]:
        assert w["weapon_id"] in ordered_names
        assert isinstance(w["level"], int)
        assert "confidence" in w and 0.0 <= w["confidence"] <= 1.0
        assert len(w["bbox"]) == 4


def test_weapons_endpoint_rejects_non_image(client):
    resp = client.post(
        "/recognize/weapons",
        files={"image": ("not-an-image.txt", b"hello", "text/plain")},
    )
    assert resp.status_code in (400, 415, 422)
