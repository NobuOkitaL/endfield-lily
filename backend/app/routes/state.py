# backend/app/routes/state.py
"""
Cross-browser state persistence endpoints.

The backend treats the state as an opaque JSON blob — it does NOT parse or
validate the shape, so the frontend schema can evolve without backend changes.
Storage is a single file at `backend/data/state.json`; writes are atomic
(temp file + os.replace in the same directory).

Endpoints (no prefix — mounted at `/state`):
    GET  /state  — returns {data, updated_at}, both null when nothing saved yet.
    PUT  /state  — accepts {data}, persists, returns {updated_at}.
"""
from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["state"])

_STATE_FILE = Path(__file__).resolve().parent.parent / "data" / "state.json"


def _state_file_path() -> Path:
    """Return the state file path. Overridable in tests via monkeypatch."""
    return _STATE_FILE


class StatePutRequest(BaseModel):
    data: Any


@router.get("/state")
async def get_state() -> dict[str, Any]:
    """Return the saved state blob, or {data: None, updated_at: None} if none.

    We deliberately return 200 with nulls (instead of 404) so the frontend's
    error handling stays a single branch — a 404 would require distinguishing
    "backend is up but empty" from "backend is down", which muddies the
    localStorage-fallback path.
    """
    path = _state_file_path()
    if not path.exists():
        return {"data": None, "updated_at": None}
    try:
        raw = path.read_text(encoding="utf-8")
        payload = json.loads(raw)
    except (OSError, json.JSONDecodeError):
        # Corrupt / unreadable file — treat as "no state"; frontend will
        # happily keep its localStorage and overwrite on next PUT.
        return {"data": None, "updated_at": None}
    return {
        "data": payload.get("data"),
        "updated_at": payload.get("updated_at"),
    }


@router.put("/state")
async def put_state(req: StatePutRequest) -> dict[str, str]:
    """Persist the given blob atomically. Returns the new updated_at timestamp."""
    path = _state_file_path()
    path.parent.mkdir(parents=True, exist_ok=True)

    updated_at = datetime.now(timezone.utc).isoformat()
    payload = {"data": req.data, "updated_at": updated_at}
    serialized = json.dumps(payload, ensure_ascii=False, indent=2)

    # Atomic write: temp file in the same dir → os.replace.
    # Same directory guarantees replace is on the same filesystem.
    fd, tmp_name = tempfile.mkstemp(
        prefix=".state.", suffix=".json.tmp", dir=str(path.parent)
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(serialized)
        os.replace(tmp_name, path)
    except Exception:
        # Clean up the temp file if the write/replace blew up.
        if os.path.exists(tmp_name):
            os.unlink(tmp_name)
        raise

    return {"updated_at": updated_at}
