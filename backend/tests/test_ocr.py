"""Unit tests for OCR quantity parsing functions.

These tests are PURE — they do NOT trigger model loading.
The OCR engine uses lazy initialization, so just importing the module
and calling parse_* functions must not download or load any model.
"""
import pytest
import numpy as np

from app.pipelines import ocr as ocr_module
from app.pipelines.ocr import (
    ocr_digits,
    parse_ocr_result,
    parse_quantity_string,
    parse_quantity_string_strict,
)


# ---------------------------------------------------------------------------
# parse_quantity_string
# ---------------------------------------------------------------------------

class TestParseQuantityString:
    def test_plain_integer(self):
        assert parse_quantity_string("245") == 245

    def test_comma_separated(self):
        assert parse_quantity_string("1,234") == 1234

    def test_plus_suffix_strips_plus(self):
        # "9999+" means ≥9999; we record the floor value
        assert parse_quantity_string("9999+") == 9999

    def test_wan_decimal(self):
        # "1.2万" → 12000
        assert parse_quantity_string("1.2万") == 12000

    def test_wan_integer(self):
        # "3万" → 30000
        assert parse_quantity_string("3万") == 30000

    def test_empty_string_returns_none(self):
        assert parse_quantity_string("") is None

    def test_garbage_returns_none(self):
        assert parse_quantity_string("?abc") is None

    def test_whitespace_only_returns_none(self):
        assert parse_quantity_string("   ") is None

    def test_zero(self):
        assert parse_quantity_string("0") == 0

    def test_known_level_prefixes_are_rescued(self):
        assert parse_quantity_string(".80") == 80
        assert parse_quantity_string("Lv.80") == 80
        assert parse_quantity_string("*80") == 80

    def test_arbitrary_text_with_digits_is_not_rescued(self):
        assert parse_quantity_string("abc999xyz") is None

    @pytest.mark.parametrize("raw,expected", [
        ("245", 245),
        ("1,234", 1234),
        ("9999+", 9999),
        ("1.2万", 12000),
        ("3万", 30000),
        ("", None),
        ("?abc", None),
    ])
    def test_parametrized(self, raw, expected):
        assert parse_quantity_string(raw) == expected


# ---------------------------------------------------------------------------
# parse_quantity_string_strict
# ---------------------------------------------------------------------------

class TestParseQuantityStringStrict:
    def test_plain_integer(self):
        assert parse_quantity_string_strict("245") == 245

    def test_comma_separated(self):
        assert parse_quantity_string_strict("1,234") == 1234

    def test_plus_suffix_strips_plus(self):
        assert parse_quantity_string_strict("9999+") == 9999

    def test_wan_integer(self):
        assert parse_quantity_string_strict("3万") == 30000

    def test_wan_decimal(self):
        assert parse_quantity_string_strict("1.2万") == 12000

    def test_leading_punctuation_is_not_rescued(self):
        assert parse_quantity_string_strict(".80") is None

    def test_lv_prefix_is_not_rescued(self):
        assert parse_quantity_string_strict("Lv.80") is None

    def test_empty_string_returns_none(self):
        assert parse_quantity_string_strict("") is None


# ---------------------------------------------------------------------------
# parse_ocr_result  (confidence gate)
# ---------------------------------------------------------------------------

class TestParseOcrResult:
    def test_high_confidence_returns_value(self):
        assert parse_ocr_result("1,234", 0.95) == 1234

    def test_exactly_at_threshold_returns_value(self):
        # 0.8 is the boundary; equal should pass
        assert parse_ocr_result("500", 0.80) == 500

    def test_mid_band_parseable_still_accepted(self):
        # 0.3 ≤ confidence < 0.8 AND parseable → trust the parse
        # (rescues RapidOCR's lower scores on clean digits, including single
        # isolated digits where the detector confidence can be ~0.3-0.5)
        assert parse_ocr_result("500", 0.6) == 500
        assert parse_ocr_result("1,234", 0.7) == 1234
        assert parse_ocr_result("1", 0.35) == 1

    def test_below_floor_returns_none(self):
        # < 0.3 is rejected regardless of parse success
        assert parse_ocr_result("500", 0.29) is None
        assert parse_ocr_result("500", 0.0) is None

    def test_mid_band_unparseable_returns_none(self):
        # Mid-band still requires a clean parse
        assert parse_ocr_result("?abc", 0.7) is None

    def test_high_confidence_garbage_returns_none(self):
        # parse_quantity_string propagates None even if confidence is fine
        assert parse_ocr_result("?abc", 0.99) is None

    def test_high_confidence_wan(self):
        assert parse_ocr_result("2万", 0.90) == 20000

    def test_high_confidence_plus(self):
        assert parse_ocr_result("9999+", 0.85) == 9999


def test_ocr_digits_prefers_complete_numeric_detection(monkeypatch):
    class FakeEngine:
        def __call__(self, _image):
            return (
                [
                    [None, ".80", "0.737"],
                    [None, "Lv.8", "0.757"],
                ],
                None,
            )

    monkeypatch.setattr(ocr_module, "_get_engine", lambda **_kwargs: FakeEngine())
    raw_text, confidence = ocr_digits(np.zeros((20, 80, 3), dtype=np.uint8))

    assert raw_text == ".80"
    assert confidence == pytest.approx(0.737)
