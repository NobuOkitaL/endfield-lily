"""OCR wrapper with quantity string parsing.

Pure parsing functions (parse_quantity_string, parse_ocr_result) have NO
side effects and do NOT load any model — safe to call in unit tests without
a model download.

ocr_digits() uses lazy engine initialization so the model is only loaded on
the first actual OCR call.
"""
from __future__ import annotations

import re
from typing import Literal

import numpy as np

# ---------------------------------------------------------------------------
# Lazy engine singletons
# ---------------------------------------------------------------------------

_engine_det = None  # type: ignore[assignment]
_engine_det_fast = None  # type: ignore[assignment]
_engine_det_legacy = None  # type: ignore[assignment]
_engine_no_det = None  # type: ignore[assignment]
# Back-compat alias for scripts/tests that reached into the original singleton.
_engine = None  # type: ignore[assignment]


DetectorProfile = Literal["accurate", "fast", "legacy"]


def _get_engine(
    use_text_det: bool = True,
    detector_profile: DetectorProfile = "accurate",
):
    """Return (and lazily init) an OCR engine singleton."""
    global _engine, _engine_det, _engine_det_fast, _engine_det_legacy, _engine_no_det
    if use_text_det:
        if detector_profile == "fast":
            if _engine_det_fast is None:
                # Crop OCR does not need RapidOCR's default ``limit_type=min``
                # detector resize, which upscales a tiny text strip until its
                # short side reaches 736 px. A bounded detector is ~10-15x
                # faster on these ROIs. Callers only trust it after cross-crop
                # agreement and fall back to the accurate profile otherwise.
                from rapidocr_onnxruntime import RapidOCR  # type: ignore[import]

                _engine_det_fast = RapidOCR(
                    use_angle_cls=False,
                    text_score=0.1,
                    det_model_path=None,
                    det_box_thresh=0.1,
                    det_unclip_ratio=3.0,
                    det_limit_side_len=320,
                    det_limit_type="max",
                )
            return _engine_det_fast

        if detector_profile == "legacy":
            if _engine_det_legacy is None:
                from rapidocr_onnxruntime import RapidOCR  # type: ignore[import]

                _engine_det_legacy = RapidOCR(
                    text_score=0.1,
                    det_model_path=None,
                    det_box_thresh=0.1,
                    det_unclip_ratio=3.0,
                )
            return _engine_det_legacy

        if _engine is not None and _engine is not _engine_det:
            _engine_det = _engine
        if _engine_det is None:
            # RapidOCR is the installed backend for this project
            from rapidocr_onnxruntime import RapidOCR  # type: ignore[import]
            _engine_det = RapidOCR(
                use_angle_cls=False,
                text_score=0.1,
                det_model_path=None,
                det_box_thresh=0.1,
                det_unclip_ratio=3.0,
                det_limit_side_len=320,
                det_limit_type="min",
            )
        _engine = _engine_det
        return _engine_det

    if _engine_no_det is None:
        # RapidOCR is the installed backend for this project
        from rapidocr_onnxruntime import RapidOCR  # type: ignore[import]
        _engine_no_det = RapidOCR(
            use_text_det=False,
            text_score=0.1,
            det_model_path=None,
            det_box_thresh=0.1,
            det_unclip_ratio=3.0,
        )
    return _engine_no_det


# ---------------------------------------------------------------------------
# Pure parsing helpers
# ---------------------------------------------------------------------------

_WAN_RE = re.compile(
    r"^\s*([0-9]+(?:\.[0-9]+)?)\s*万\s*$",
    re.UNICODE,
)
_NUM_RE = re.compile(r"^\s*([0-9][0-9,]*)\+?\s*$")
_STRICT_WAN_RE = re.compile(
    r"^\s*([0-9]+(?:\.[0-9]+)?)\s*万\s*$",
    re.UNICODE,
)
_STRICT_NUM_RE = re.compile(r"^\s*([0-9][0-9,]*)\+?\s*$")
# Narrow rescue for the OCR splits we actually observe: punctuation before a
# number (".80", "*80") or an Lv/LV prefix. Do not search arbitrary text for
# a digit run — e.g. "abc999xyz" is UI noise, not a trustworthy quantity.
_PREFIXED_NUM_RE = re.compile(
    r"^\s*(?:(?:lv)\.?\s*|[^0-9A-Za-z\s]{1,3}\s*)([0-9][0-9,]*)\+?\s*$",
    re.IGNORECASE,
)
_DIGIT_RE = re.compile(r"\d")

CONFIDENCE_THRESHOLD = 0.8
# Lower floor at which a "clean" digit string is still trustable. RapidOCR
# scores multi-digit text around 0.6-0.75 and single isolated digits around
# 0.25-0.5 (the detector is less confident on narrow single characters). We
# accept as low as 0.3 because `parse_quantity_string` strictly requires a
# digits-only match — even low-confidence non-digit noise won't parse, so
# the regex provides the real safety net.
PARSEABLE_CONFIDENCE_FLOOR = 0.3


def parse_quantity_string_strict(raw: str) -> int | None:
    """Parse clean quantity OCR text without leading-junk rescue."""
    if not raw or not raw.strip():
        return None

    wan_match = _STRICT_WAN_RE.match(raw)
    if wan_match:
        value = float(wan_match.group(1)) * 10_000
        return int(round(value))

    num_match = _STRICT_NUM_RE.match(raw)
    if num_match:
        digits = num_match.group(1).replace(",", "")
        return int(digits)

    return None


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

    # Fallback: OCR sometimes returns a known prefix or leading punctuation
    # when it splits "Lv.80" into pieces. Keep this deliberately anchored so
    # unrelated UI strings containing digits cannot become quantities.
    prefixed = _PREFIXED_NUM_RE.match(raw)
    if prefixed:
        return int(prefixed.group(1).replace(",", ""))

    return None


def parse_ocr_result(raw: str, confidence: float) -> int | None:
    """Wrap parse_quantity_string with a tiered confidence gate.

    - confidence >= CONFIDENCE_THRESHOLD (0.8): trust the parse result directly.
    - PARSEABLE_CONFIDENCE_FLOOR <= confidence < 0.8: trust only if the string
      parses cleanly to a non-negative integer (rescues RapidOCR's lower scores
      on clean digits).
    - confidence < PARSEABLE_CONFIDENCE_FLOOR (0.3): reject outright.
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

def ocr_digits(
    image: np.ndarray,
    *,
    use_text_det: bool = True,
    detector_profile: DetectorProfile = "accurate",
) -> tuple[str, float]:
    """Run OCR on *image* and return (text, confidence) of the best match.

    Uses rapidocr-onnxruntime as the backend (lazy init on first call).
    Returns ("", 0.0) when no text is detected.

    The engine is constructed with relaxed detection params (`text_score`,
    `det_box_thresh`, `det_unclip_ratio`) because the defaults reject isolated
    single digits like "1" or "5" on game quantity cards — the detector thinks
    a narrow single glyph isn't a text region. With the defaults, `engine(qr)`
    sometimes returns None even when the digit is clearly visible; the looser
    params produce a stable ~0.5 confidence result. The safety net is still
    `parse_quantity_string` which rejects non-digit strings.
    """
    engine = _get_engine(
        use_text_det=use_text_det,
        detector_profile=detector_profile,
    )
    result, _elapse = engine(image)

    if not result:
        return "", 0.0

    # Loose detection thresholds give us multiple detections per slot. Prefer
    # a digit-containing detection with the most complete numeric token, then
    # tie-break by confidence. Confidence-only ranking can choose "Lv.8" over
    # a separate ".80" detection for the same visible "Lv.80" label.

    best_text = ""
    best_conf = 0.0
    best_has_digit = False
    best_digit_count = 0
    for _box, text, conf_str in result:
        try:
            conf = float(conf_str)
        except (ValueError, TypeError):
            conf = 0.0
        digit_count = len(_DIGIT_RE.findall(text))
        has_digit = digit_count > 0
        # Prefer digit-containing texts; within that tier prefer completeness,
        # then confidence. Route-level range checks and cross-crop voting remain
        # the safety net against unrelated longer digit strings.
        better = (
            (has_digit and not best_has_digit)
            or (
                has_digit == best_has_digit
                and digit_count > best_digit_count
            )
            or (
                has_digit == best_has_digit
                and digit_count == best_digit_count
                and conf > best_conf
            )
        )
        if better:
            best_text = text
            best_conf = conf
            best_has_digit = has_digit
            best_digit_count = digit_count

    return best_text, best_conf
