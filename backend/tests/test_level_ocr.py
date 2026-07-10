from app.pipelines.level_ocr import parse_level


def test_parse_level_enforces_game_range():
    assert parse_level("Lv.1", 0.8) == 1
    assert parse_level("Lv.90", 0.8) == 90
    assert parse_level("Lv.0", 0.9) is None
    assert parse_level("Lv.91", 0.9) is None
    assert parse_level("2026", 0.9) is None


def test_parse_level_keeps_weapon_level_one_rescue_local():
    assert parse_level("1", 0.15) is None
    assert parse_level("1", 0.15, low_confidence_level_one=0.10) == 1
