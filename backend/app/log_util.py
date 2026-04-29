"""Lightweight logging helpers for backend app logs."""
from __future__ import annotations

import logging
import secrets
import sys


_UVICORN_LEVELS = {
    logging.DEBUG,
    logging.INFO,
    logging.WARNING,
    logging.ERROR,
    logging.CRITICAL,
}
_FALLBACK_HANDLER_MARKER = "_zmd_app_fallback_handler"


def _effective_app_level(default: int) -> int:
    """Mirror uvicorn's selected level when it has already configured one."""
    uvicorn_level = logging.getLogger("uvicorn.error").level
    if uvicorn_level in _UVICORN_LEVELS:
        return uvicorn_level
    return default


def _has_visible_handler(logger: logging.Logger) -> bool:
    current: logging.Logger | None = logger
    while current is not None:
        if current.handlers:
            return True
        if not current.propagate:
            return False
        current = current.parent
    return False


def configure_logging(level: int = logging.INFO) -> None:
    """Configure the ``app`` logger to play nicely with uvicorn.

    Uvicorn does not always attach a root handler for application loggers, so
    a small stderr fallback keeps local smoke tests and dev-server logs visible
    without duplicating output when an ancestor handler already exists.
    """
    root_app_logger = logging.getLogger("app")
    root_app_logger.setLevel(_effective_app_level(level))
    root_app_logger.propagate = True

    if _has_visible_handler(root_app_logger):
        return

    handler = logging.StreamHandler(sys.stderr)
    setattr(handler, _FALLBACK_HANDLER_MARKER, True)
    handler.setFormatter(logging.Formatter("%(levelname)s:     %(message)s"))
    root_app_logger.addHandler(handler)


def make_request_id(prefix: str) -> str:
    """Return a short route-scoped request id, e.g. ``inv:a3f9``."""
    return f"{prefix}:{secrets.token_hex(2)}"
