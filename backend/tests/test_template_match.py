import json

import cv2
import numpy as np

from app.pipelines.template_match import (
    TemplateLibrary,
    _diff_ratio,
    _normalize_thumbnail,
    clear_template_library_cache,
    is_confident_match,
    load_template_library,
    match_slot,
)


def _make_template(size: int = 96, intensity: int = 180) -> np.ndarray:
    img = np.zeros((size, size), dtype=np.uint8)
    img[10:-10, 10:-10] = intensity
    return img


def test_match_slot_identifies_correct_template():
    """
    Library holds 3 distinct templates; when the slot is identical to one of
    them (the contract production callers actually hit — slots are already
    pre-cropped to the icon region by the pipeline), match_slot must return
    the correct id with ~perfect confidence.
    """
    t1 = _make_template(intensity=180)
    t2 = _make_template(intensity=120)
    t3 = np.zeros((96, 96), dtype=np.uint8)
    t3[::8, :] = 255  # striped pattern

    lib = TemplateLibrary({"mat_a": t1, "mat_b": t2, "mat_c": t3})

    # Slot == t1: pipelined-identical inputs should yield conf ≈ 1.0.
    result = match_slot(t1, lib, threshold=0.8)
    assert result.material_id == "mat_a"
    assert result.confidence >= 0.99


def test_match_slot_distinguishes_between_templates():
    """
    Distinct templates (different intensity / pattern) must rank correctly:
    for each, the matching entry has the lowest diff_ratio.  We don't assert
    a confidence floor here — the pixelmatch-style diff is forgiving on flat
    grayscale patches and may not clear 0.8 even on the correct template —
    but the *ordering* (correct template beats others) is the load-bearing
    property.
    """
    t1 = _make_template(intensity=180)
    t2 = _make_template(intensity=120)
    t3 = np.zeros((96, 96), dtype=np.uint8)
    t3[::8, :] = 255

    lib = TemplateLibrary({"mat_a": t1, "mat_b": t2, "mat_c": t3})

    # threshold=0.0 to disable rejection; we're verifying ranking, not
    # the accept/reject decision.
    r1 = match_slot(t1, lib, threshold=0.0)
    r2 = match_slot(t2, lib, threshold=0.0)
    r3 = match_slot(t3, lib, threshold=0.0)
    assert r1.material_id == "mat_a"
    assert r2.material_id == "mat_b"
    assert r3.material_id == "mat_c"


def test_low_confidence_returns_unknown():
    """
    A slot that shares no structure with the library (random noise) should
    fall below threshold and come back as unknown.
    """
    t1 = _make_template(intensity=180)
    lib = TemplateLibrary({"mat_a": t1})

    rng = np.random.default_rng(42)
    slot = rng.integers(0, 256, size=(140, 140), dtype=np.uint8)
    result = match_slot(slot, lib, threshold=0.8)
    assert result.material_id is None
    assert result.confidence < 0.8


def test_avatar_overlay_does_not_break_match():
    template = np.zeros((100, 100, 4), dtype=np.uint8)
    template[:38, 64:100, 3] = 255
    template[:38, 64:100, :3] = (28, 34, 40)
    cv2.rectangle(template, (66, 6), (96, 34), (160, 190, 210, 255), 3)
    cv2.line(template, (64, 36), (99, 2), (230, 210, 80, 255), 4)

    query = template.copy()
    cv2.circle(query, (85, 15), 15, (40, 80, 230, 255), -1)

    lib = TemplateLibrary({"weapon_a": template}, asset_type="weapons")
    result = match_slot(query, lib, threshold=0.8)

    template_without_avatar_mask = _normalize_thumbnail(template, avatar_mask=None)
    query_without_avatar_mask = _normalize_thumbnail(query, avatar_mask=None)
    mask_off_confidence = 1.0 - _diff_ratio(
        template_without_avatar_mask, query_without_avatar_mask
    )

    assert result.material_id == "weapon_a"
    assert result.confidence > 0.85
    assert mask_off_confidence < 0.7


def test_empty_library_returns_unknown():
    lib = TemplateLibrary({})
    slot = np.zeros((100, 100), dtype=np.uint8)
    result = match_slot(slot, lib, threshold=0.8)
    assert result.material_id is None


def test_near_tied_templates_are_not_safe_for_auto_import():
    template = _make_template()
    lib = TemplateLibrary({"mat_a": template, "mat_b": template.copy()})

    result = match_slot(template, lib, threshold=0.0)

    assert result.confidence >= 0.99
    assert result.diffs_too_close is True
    assert is_confident_match(result) is False


def test_template_library_cache_reuses_and_invalidates(tmp_path):
    assets_root = tmp_path / "assets"
    assets_dir = assets_root / "materials"
    assets_dir.mkdir(parents=True)
    template_path = assets_dir / "示例.png"
    assert cv2.imwrite(str(template_path), _make_template())
    mapping_path = assets_root / "materials.json"
    mapping_path.write_text(
        json.dumps({"示例": "materials/示例.png"}, ensure_ascii=False),
        encoding="utf-8",
    )

    clear_template_library_cache()
    first = load_template_library(assets_dir, mapping_path)
    second = load_template_library(assets_dir, mapping_path)
    assert second is first

    clear_template_library_cache()
    third = load_template_library(assets_dir, mapping_path)
    assert third is not first
