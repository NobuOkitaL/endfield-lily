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
# scores multi-digit text around 0.6-0.75 and single isolated digits around
# 0.25-0.5 (the detector is less confident on narrow single characters). We
# accept as low as 0.3 because `parse_quantity_string` strictly requires a
# digits-only match — even low-confidence non-digit noise won't parse, so
# the regex provides the real safety net.
PARSEABLE_CONFIDENCE_FLOOR = 0.3


def parse_quantity_string(raw: str) -> int | None:
    """Parse a quantity string from OCR text into an integer.

    Handles:
    - Plain integers: "245" → 245
    - Comma-separated: "1,234" → 1234
    - Plus-suffix (capped display): "9999+" → 9999
    - 万 (10,000) unit: "3万" → 30000, "1.2万" → 12000
    - Leading junk from split OCR detections: ".80" → 80, "Lv.80" → 80
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

    # Fallback: OCR sometimes returns leading punctuation / letters (e.g.
    # ".80", "Lv.80", "*80") when the engine splits "Lv.80" into pieces.
    # Pull out the first run of digits.
    leading_digits = re.search(r"\d[\d,]*", raw)
    if leading_digits:
        return int(leading_digits.group(0).replace(",", ""))

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

    We pass relaxed detection params (`text_score`, `box_thresh`,
    `unclip_ratio`) because the defaults reject isolated single digits like
    "1" or "5" on game quantity cards — the detector thinks a narrow single
    glyph isn't a text region. With the defaults, `engine(qr)` sometimes
    returns None even when the digit is clearly visible; the looser params
    produce a stable ~0.5 confidence result. The safety net is still
    `parse_quantity_string` which rejects non-digit strings.
    """
    engine = _get_engine()
    result, _elapse = engine(
        image, text_score=0.1, box_thresh=0.1, unclip_ratio=3.0
    )

    if not result:
        return "", 0.0

    # Loose detection thresholds give us multiple detections per slot. Prefer
    # a detection that *contains* digits (e.g. "90" or "Lv.90") over one
    # that's just a label ("LV."), then tie-break by confidence. This avoids
    # both:
    #   (a) returning only "LV." and dropping the number (levels OCR)
    #   (b) concatenating spurious digit detections from elsewhere in the
    #       crop, which produced nonsense like "3090" or "20202"
    import re
    _DIGIT = re.compile(r"\d")

    best_text = ""
    best_conf = 0.0
    best_has_digit = False
    for _box, text, conf_str in result:
        try:
            conf = float(conf_str)
        except (ValueError, TypeError):
            conf = 0.0
        has_digit = bool(_DIGIT.search(text))
        # Prefer digit-containing texts; within a tier, higher conf wins.
        better = (
            (has_digit and not best_has_digit)
            or (has_digit == best_has_digit and conf > best_conf)
        )
        if better:
            best_text, best_conf, best_has_digit = text, conf, has_digit

    return best_text, best_conf
