"""OCR wrapper with quantity string parsing.

Pure parsing functions (parse_quantity_string, parse_ocr_result) have NO
side effects and do NOT load any model — safe to call in unit tests without
a model download.

ocr_digits() uses lazy engine initialization so the model is only loaded on
the first actual OCR call.
"""
from __future__ import annotations

import re
from typing import TYPE_CHECKING

import numpy as np

# ---------------------------------------------------------------------------
# Lazy engine singleton
# ---------------------------------------------------------------------------

_engine = None  # type: ignore[assignment]


def _get_engine():
    """Return (and lazily init) the OCR engine singleton."""
    global _engine
    if _engine is None:
        # RapidOCR is the installed backend for this project
        from rapidocr_onnxruntime import RapidOCR  # type: ignore[import]
        _engine = RapidOCR()
    return _engine


# ---------------------------------------------------------------------------
# Pure parsing helpers
# ---------------------------------------------------------------------------

_WAN_RE = re.compile(
    r"^\s*([0-9]+(?:\.[0-9]+)?)\s*万\s*$",
    re.UNICODE,
)
_NUM_RE = re.compile(r"^\s*([0-9][0-9,]*)\+?\s*$")

CONFIDENCE_THRESHOLD = 0.8
# Lower floor at which a "clean" digit string is still trustable. RapidOCR
# tends to score synthetic / cv2.putText text around 0.6-0.75 even when it
# reads the digits correctly; the design doc's 0.8 cutoff was calibrated for
# PaddleOCR which we couldn't install. We keep the 0.8 strict path for
# "was-there-text-here" judgement but accept a lower confidence when the text
# unambiguously parses to a positive integer / quantity.
PARSEABLE_CONFIDENCE_FLOOR = 0.5


def parse_quantity_string(raw: str) -> int | None:
    """Parse a quantity string from OCR text into an integer.

    Handles:
    - Plain integers: "245" → 245
    - Comma-separated: "1,234" → 1234
    - Plus-suffix (capped display): "9999+" → 9999
    - 万 (10,000) unit: "3万" → 30000, "1.2万" → 12000
    - Empty / garbage: → None
    """
    if not raw or not raw.strip():
        return None

    # 万 (Chinese 10,000 unit) — must check before numeric RE
    wan_match = _WAN_RE.match(raw)
    if wan_match:
        value = float(wan_match.group(1)) * 10_000
        return int(round(value))

    # Plain number (optionally with commas and/or trailing +)
    num_match = _NUM_RE.match(raw)
    if num_match:
        digits = num_match.group(1).replace(",", "")
        return int(digits)

    return None


def parse_ocr_result(raw: str, confidence: float) -> int | None:
    """Wrap parse_quantity_string with a tiered confidence gate.

    - confidence >= CONFIDENCE_THRESHOLD (0.8): trust the parse result directly.
    - PARSEABLE_CONFIDENCE_FLOOR <= confidence < 0.8: trust only if the string
      parses cleanly to a non-negative integer (rescues RapidOCR's lower scores
      on clean digits).
    - confidence < PARSEABLE_CONFIDENCE_FLOOR (0.5): reject outright.
    """
    if confidence < PARSEABLE_CONFIDENCE_FLOOR:
        return None
    parsed = parse_quantity_string(raw)
    if parsed is None:
        return None
    if confidence >= CONFIDENCE_THRESHOLD:
        return parsed
    # Mid-band: only accept if we fully parsed AND value is sane
    if parsed < 0:
        return None
    return parsed


# ---------------------------------------------------------------------------
# OCR engine call
# ---------------------------------------------------------------------------

def ocr_digits(image: np.ndarray) -> tuple[str, float]:
    """Run OCR on *image* and return (text, confidence) of the best match.

    Uses rapidocr-onnxruntime as the backend (lazy init on first call).
    Returns ("", 0.0) when no text is detected.
    """
    engine = _get_engine()
    result, _elapse = engine(image)

    if not result:
        return "", 0.0

    # result is a list of [box, text, str(confidence)]
    # Pick the detection with the highest confidence
    best_text = ""
    best_conf = 0.0
    for _box, text, conf_str in result:
        try:
            conf = float(conf_str)
        except (ValueError, TypeError):
            conf = 0.0
        if conf > best_conf:
            best_conf = conf
            best_text = text

    return best_text, best_conf
