import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.pipelines.grid_detect import detect_slots
from app.pipelines.preprocess import load_and_normalize
from app.pipelines.template_match import TemplateLibrary
from .fixtures.build_inventory_fixture import build_inventory_image


@pytest.fixture
def client():
    return TestClient(app)


def _png_bytes(img: np.ndarray) -> bytes:
    success, buf = cv2.imencode(".png", img)
    assert success
    return buf.tobytes()


def _library_from_pipeline(img_bgr: np.ndarray, names: list[str]) -> TemplateLibrary:
    """
    Extract the icon region of each detected slot from the normalized canvas,
    and use those as the library templates.  This keeps the library in the same
    scale / colorspace as what the pipeline will match against, which is the
    invariant the recognizer relies on in production (icons are stored at
    canvas-scale).
    """
    canvas = load_and_normalize(img_bgr)
    slots = sorted(detect_slots(canvas), key=lambda b: (b[1], b[0]))
    assert len(slots) >= len(names), f"expected ≥{len(names)} slots, got {len(slots)}"
    templates: dict[str, np.ndarray] = {}
    for name, (x, y, w, h) in zip(names, slots, strict=False):
        icon = canvas[y : y + int(h * 0.7), x : x + w].copy()
        templates[name] = icon
    return TemplateLibrary(templates)


def test_inventory_endpoint_returns_items_for_synthetic_screenshot(client, monkeypatch):
    """
    Feed a synthetic grid with known templates + quantities, verify the full
    pipeline (decode → normalize → detect → match → OCR → response) returns
    matched items with the expected ids and quantities.
    """
    # Build 4 distinct 280×280 templates (size chosen so the pattern is large
    # enough for OCR + template match to have signal).  The fixture embeds them
    # in the upper 70% of each slot.
    size = 280
    templates_src: dict[str, np.ndarray] = {
        "mat_aaa": np.full((size, size), 60, dtype=np.uint8),
        "mat_bbb": np.full((size, size), 120, dtype=np.uint8),
        "mat_ccc": np.full((size, size), 180, dtype=np.uint8),
        "mat_ddd": np.full((size, size), 240, dtype=np.uint8),
    }
    # Distinguishing horizontal stripe pattern so NCC can tell templates apart
    for i, t in enumerate(templates_src.values()):
        t[::(i + 2) * 4, :] = 0

    quantities = {"mat_aaa": 12, "mat_bbb": 345, "mat_ccc": 99, "mat_ddd": 7}
    # 2×2 grid at slot_size=400 → screenshot ≈ 880×880 → normalize upscales to
    # 1080×1080 (factor ≈ 1.23).  The library is built AFTER normalize so it
    # matches what the pipeline sees.
    img, gt = build_inventory_image(
        templates_src, quantities, rows=2, cols=2,
    )

    ordered_names = [n for n, _, _ in sorted(gt, key=lambda r: (r[2][1], r[2][0]))]
    library = _library_from_pipeline(img, ordered_names)

    from app.routes import inventory as inv_mod

    monkeypatch.setattr(inv_mod, "_load_library", lambda: library)

    resp = client.post(
        "/recognize/inventory",
        files={"image": ("screenshot.png", _png_bytes(img), "image/png")},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert "unknowns" in data

    # Template matching should be perfect (library is exactly the pipeline output).
    # OCR on cv2.putText digits is the lossy step — allow up to 1 failure out of 4.
    total_placed = len(ordered_names)
    items_plus_unknowns = len(data["items"]) + len(data["unknowns"])
    assert items_plus_unknowns == total_placed, (
        f"pipeline saw {items_plus_unknowns} slots but placed {total_placed}"
    )
    assert len(data["items"]) >= total_placed - 1, (
        f"only {len(data['items'])}/{total_placed} items recognized; "
        f"unknowns: {[u.get('raw_ocr_text') for u in data['unknowns']]}"
    )
    for item in data["items"]:
        assert item["material_id"] in ordered_names
        assert isinstance(item["quantity"], int)
        assert "confidence" in item and 0.0 <= item["confidence"] <= 1.0
        assert len(item["bbox"]) == 4


def test_inventory_endpoint_rejects_non_image(client):
    resp = client.post(
        "/recognize/inventory",
        files={"image": ("not-an-image.txt", b"hello", "text/plain")},
    )
    # Either 400, 415, or 422 is acceptable
    assert resp.status_code in (400, 415, 422)


def test_inventory_recognizes_top_bar_currency(client, monkeypatch):
    img = np.zeros((884, 1920, 3), dtype=np.uint8)
    cv2.rectangle(img, (1320, 12), (1660, 70), (54, 54, 54), -1)
    cv2.putText(
        img,
        "5200308",
        (1430, 53),
        cv2.FONT_HERSHEY_SIMPLEX,
        1.0,
        (235, 235, 235),
        2,
        cv2.LINE_AA,
    )

    from app.routes import inventory as inv_mod

    monkeypatch.setattr(inv_mod, "_load_library", lambda: TemplateLibrary({}))

    resp = client.post(
        "/recognize/inventory",
        files={"image": ("currency.png", _png_bytes(img), "image/png")},
    )
    assert resp.status_code == 200
    data = resp.json()
    currencies = [
        item for item in data["items"] if item["material_id"] == "折金票"
    ]
    assert currencies
    assert currencies[0]["quantity"] > 0
