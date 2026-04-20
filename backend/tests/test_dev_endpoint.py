import base64
import json
from pathlib import Path

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app
from .fixtures.build_inventory_fixture import build_inventory_image


@pytest.fixture
def client():
    return TestClient(app)


def _png_bytes(img: np.ndarray) -> bytes:
    success, buf = cv2.imencode(".png", img)
    assert success
    return buf.tobytes()


def test_extract_slots_returns_slots_with_base64(client):
    """
    Feed a synthetic 2×2 inventory screenshot and verify /dev/extract-slots
    returns ≥1 slot and valid base64-encoded color PNG crops.
    """
    size = 280
    templates_src: dict[str, np.ndarray] = {
        "mat_aaa": np.full((size, size), 60, dtype=np.uint8),
        "mat_bbb": np.full((size, size), 120, dtype=np.uint8),
        "mat_ccc": np.full((size, size), 180, dtype=np.uint8),
        "mat_ddd": np.full((size, size), 240, dtype=np.uint8),
    }
    for i, t in enumerate(templates_src.values()):
        t[:: (i + 2) * 4, :] = 0
    quantities = {"mat_aaa": 12, "mat_bbb": 345, "mat_ccc": 99, "mat_ddd": 7}
    img, _gt = build_inventory_image(templates_src, quantities, rows=2, cols=2)

    resp = client.post(
        "/dev/materials/extract-slots",
        files={"image": ("screenshot.png", _png_bytes(img), "image/png")},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "slots" in data
    assert len(data["slots"]) >= 1

    for slot in data["slots"]:
        assert "index" in slot
        assert "bbox" in slot
        assert len(slot["bbox"]) == 4
        assert "icon_base64" in slot
        assert slot["icon_base64"]
        decoded = base64.b64decode(slot["icon_base64"])
        arr = np.frombuffer(decoded, dtype=np.uint8)
        img_decoded = cv2.imdecode(arr, cv2.IMREAD_UNCHANGED)
        assert img_decoded is not None
        assert img_decoded.ndim == 3
        assert img_decoded.shape[2] == 3


def test_save_templates_writes_png_and_updates_json(client, monkeypatch, tmp_path):
    """
    /dev/save-templates should write a PNG into the materials directory and
    update materials.json to point at the new filename-based path.  Uses
    monkeypatch + tmp_path so we don't touch the real asset directory.
    """
    from app.routes import dev as dev_mod

    tmp_assets = tmp_path / "assets"
    tmp_materials = tmp_assets / "materials"
    tmp_materials.mkdir(parents=True)
    # Seed with a minimal materials.json having one known key
    mapping = {"折金票": "materials/mat_000.png", "协议圆盘": "materials/mat_010.png"}
    (tmp_assets / "materials.json").write_text(
        json.dumps(mapping, ensure_ascii=False), encoding="utf-8"
    )

    monkeypatch.setattr(dev_mod, "_assets_dir", lambda: tmp_assets)

    # Build a small color PNG and base64-encode it
    icon = np.zeros((60, 60, 3), dtype=np.uint8)
    icon[:, :, 1] = 200
    success, buf = cv2.imencode(".png", icon)
    assert success
    icon_b64 = base64.b64encode(buf.tobytes()).decode("ascii")

    resp = client.post(
        "/dev/materials/save-templates",
        json={"entries": [{"name": "折金票", "icon_base64": icon_b64}]},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["saved"] == 1
    assert data["skipped"] == []

    out_path: Path = tmp_materials / "折金票.png"
    assert out_path.exists()
    written = cv2.imread(str(out_path), cv2.IMREAD_UNCHANGED)
    assert written is not None
    assert written.shape == (60, 60, 3)

    updated = json.loads((tmp_assets / "materials.json").read_text(encoding="utf-8"))
    assert updated["折金票"] == "materials/折金票.png"
    assert updated["协议圆盘"] == "materials/mat_010.png"

    # labeled tracker should record the new capture
    labeled = json.loads((tmp_assets / "materials.labeled.json").read_text(encoding="utf-8"))
    assert "折金票" in labeled


def test_save_templates_skips_already_labeled(client, monkeypatch, tmp_path):
    """If a name is already in the labeled tracker, save-templates should skip
    it (not overwrite), and report it in the `skipped` array."""
    from app.routes import dev as dev_mod

    tmp_assets = tmp_path / "assets"
    (tmp_assets / "materials").mkdir(parents=True)
    (tmp_assets / "materials.json").write_text(
        json.dumps({"折金票": "materials/mat_000.png"}, ensure_ascii=False),
        encoding="utf-8",
    )
    # Pre-populate the labeled tracker so 折金票 appears "already captured"
    (tmp_assets / "materials.labeled.json").write_text(
        json.dumps(["折金票"], ensure_ascii=False),
        encoding="utf-8",
    )
    monkeypatch.setattr(dev_mod, "_assets_dir", lambda: tmp_assets)

    icon = np.zeros((10, 10, 3), dtype=np.uint8)
    _, buf = cv2.imencode(".png", icon)
    icon_b64 = base64.b64encode(buf.tobytes()).decode("ascii")

    resp = client.post(
        "/dev/materials/save-templates",
        json={"entries": [{"name": "折金票", "icon_base64": icon_b64}]},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["saved"] == 0
    assert data["skipped"] == ["折金票"]
    # PNG should NOT have been written (sentinel check: the file doesn't exist)
    assert not (tmp_assets / "materials" / "折金票.png").exists()


def test_delete_template_removes_png_and_tracker(client, monkeypatch, tmp_path):
    from app.routes import dev as dev_mod

    tmp_assets = tmp_path / "assets"
    (tmp_assets / "materials").mkdir(parents=True)
    (tmp_assets / "materials.json").write_text(
        json.dumps({"折金票": "materials/折金票.png"}, ensure_ascii=False),
        encoding="utf-8",
    )
    (tmp_assets / "materials.labeled.json").write_text(
        json.dumps(["折金票"], ensure_ascii=False), encoding="utf-8"
    )
    png_path = tmp_assets / "materials" / "折金票.png"
    icon = np.full((20, 20, 3), 120, dtype=np.uint8)
    cv2.imwrite(str(png_path), icon)
    assert png_path.exists()
    monkeypatch.setattr(dev_mod, "_assets_dir", lambda: tmp_assets)

    resp = client.delete("/dev/materials/templates/折金票")
    assert resp.status_code == 200
    assert resp.json() == {"deleted": "折金票"}
    assert not png_path.exists()

    labeled_after = json.loads(
        (tmp_assets / "materials.labeled.json").read_text(encoding="utf-8")
    )
    assert "折金票" not in labeled_after


def test_delete_template_404_when_not_labeled(client, monkeypatch, tmp_path):
    from app.routes import dev as dev_mod

    tmp_assets = tmp_path / "assets"
    (tmp_assets / "materials").mkdir(parents=True)
    (tmp_assets / "materials.json").write_text(
        json.dumps({"折金票": "materials/折金票.png"}, ensure_ascii=False),
        encoding="utf-8",
    )
    monkeypatch.setattr(dev_mod, "_assets_dir", lambda: tmp_assets)

    resp = client.delete("/dev/materials/templates/折金票")
    assert resp.status_code == 404


def test_list_names_flags_labeled(client, monkeypatch, tmp_path):
    """GET /names returns {name, labeled} entries; labeled reflects the
    tracker file."""
    from app.routes import dev as dev_mod

    tmp_assets = tmp_path / "assets"
    (tmp_assets / "materials").mkdir(parents=True)
    (tmp_assets / "materials.json").write_text(
        json.dumps(
            {"折金票": "materials/mat_000.png", "协议圆盘": "materials/mat_010.png"},
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    (tmp_assets / "materials.labeled.json").write_text(
        json.dumps(["协议圆盘"], ensure_ascii=False), encoding="utf-8"
    )
    monkeypatch.setattr(dev_mod, "_assets_dir", lambda: tmp_assets)

    resp = client.get("/dev/materials/names")
    assert resp.status_code == 200
    data = resp.json()
    by_name = {e["name"]: e["labeled"] for e in data["names"]}
    assert by_name == {"折金票": False, "协议圆盘": True}


def test_save_templates_rejects_unknown_material(client, monkeypatch, tmp_path):
    from app.routes import dev as dev_mod

    tmp_assets = tmp_path / "assets"
    (tmp_assets / "materials").mkdir(parents=True)
    (tmp_assets / "materials.json").write_text(
        json.dumps({"折金票": "materials/mat_000.png"}, ensure_ascii=False),
        encoding="utf-8",
    )
    monkeypatch.setattr(dev_mod, "_assets_dir", lambda: tmp_assets)

    icon = np.zeros((10, 10, 3), dtype=np.uint8)
    _, buf = cv2.imencode(".png", icon)
    icon_b64 = base64.b64encode(buf.tobytes()).decode("ascii")

    resp = client.post(
        "/dev/materials/save-templates",
        json={"entries": [{"name": "不存在的材料", "icon_base64": icon_b64}]},
    )
    assert resp.status_code == 400
