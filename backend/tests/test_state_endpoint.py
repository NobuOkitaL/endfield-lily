"""
Tests for the cross-browser state sync endpoints (GET /state, PUT /state).

Uses monkeypatch to redirect `_state_file_path` at `tmp_path / state.json`,
mirroring the pattern in test_dev_endpoint.py so real user data is never
touched by the test suite.
"""
import json

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def tmp_state_file(monkeypatch, tmp_path):
    """Redirect the state file to a tmp location for this test."""
    from app.routes import state as state_mod

    path = tmp_path / "state.json"
    monkeypatch.setattr(state_mod, "_state_file_path", lambda: path)
    return path


def test_get_state_empty_returns_nulls(client, tmp_state_file):
    """Before anything has been saved, GET /state returns {data: None,
    updated_at: None} with a 200 (NOT a 404 — see route docstring)."""
    resp = client.get("/state")
    assert resp.status_code == 200
    assert resp.json() == {"data": None, "updated_at": None}
    assert not tmp_state_file.exists()


def test_put_state_writes_file_and_returns_timestamp(client, tmp_state_file):
    """PUT /state with a sample blob writes to disk and returns updated_at."""
    sample = {"stock": {"折金票": 100}, "ownedOperators": {"洛茜": {"等级": 45}}}
    resp = client.put("/state", json={"data": sample})
    assert resp.status_code == 200
    payload = resp.json()
    assert "updated_at" in payload
    assert payload["updated_at"]  # non-empty ISO string
    assert tmp_state_file.exists()

    # File content round-trips: its `data` matches what we PUT.
    on_disk = json.loads(tmp_state_file.read_text(encoding="utf-8"))
    assert on_disk["data"] == sample
    assert on_disk["updated_at"] == payload["updated_at"]


def test_put_then_get_round_trip(client, tmp_state_file):
    """PUT → GET returns exactly the blob we stored."""
    sample = {
        "stock": {"协议圆盘": 7, "折金票": 200},
        "ownedOperators": {"洛茜": {"精英阶段": 2, "等级": 50}},
        "operatorGoals": [],
        "settings": {"darkMode": False, "syncToBackend": True},
    }
    put_resp = client.put("/state", json={"data": sample})
    assert put_resp.status_code == 200
    updated_at = put_resp.json()["updated_at"]

    get_resp = client.get("/state")
    assert get_resp.status_code == 200
    body = get_resp.json()
    assert body["data"] == sample
    assert body["updated_at"] == updated_at


def test_put_overwrites_previous_state(client, tmp_state_file):
    """A second PUT should fully replace the first — GET reflects the newer
    data (no merging). This is the 'cross-browser push' contract: last write
    wins, nothing is accreted server-side."""
    first = {"stock": {"折金票": 10}}
    second = {"stock": {"协议圆盘": 99}, "operatorGoals": [{"id": "g1"}]}

    r1 = client.put("/state", json={"data": first})
    assert r1.status_code == 200
    first_updated = r1.json()["updated_at"]

    r2 = client.put("/state", json={"data": second})
    assert r2.status_code == 200
    second_updated = r2.json()["updated_at"]
    # Timestamps are distinct monotonic ISO strings.
    assert second_updated >= first_updated

    resp = client.get("/state")
    body = resp.json()
    assert body["data"] == second
    assert body["data"] != first
    assert body["updated_at"] == second_updated
