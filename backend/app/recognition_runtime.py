"""Runtime guard for CPU-heavy recognition requests."""
from __future__ import annotations

import os
from contextlib import contextmanager
from threading import BoundedSemaphore
from typing import Iterator


def _configured_concurrency() -> int:
    raw = os.getenv("ZMD_RECOGNITION_CONCURRENCY", "1")
    try:
        return max(1, int(raw))
    except ValueError:
        return 1


# RapidOCR/ONNX Runtime already uses several CPU threads per inference. A
# bounded gate prevents a burst of uploads from multiplying that fan-out and
# exhausting the machine. Sync FastAPI routes still run in Starlette's worker
# pool, so the event loop remains responsive while a request waits here.
_RECOGNITION_SLOTS = BoundedSemaphore(_configured_concurrency())


@contextmanager
def recognition_slot() -> Iterator[None]:
    _RECOGNITION_SLOTS.acquire()
    try:
        yield
    finally:
        _RECOGNITION_SLOTS.release()
