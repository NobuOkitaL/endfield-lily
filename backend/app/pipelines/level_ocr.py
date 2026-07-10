"""Shared, conservative OCR cascade for operator and weapon levels."""
from __future__ import annotations

import re
from collections.abc import Callable, Sequence
from dataclasses import dataclass

import numpy as np

from app.pipelines.ocr import (
    DetectorProfile,
    ocr_digits,
    parse_ocr_result,
    parse_quantity_string,
)


_LV_PREFIX_RE = re.compile(r"^\s*Lv\.?\s*", re.IGNORECASE)
_MIN_LEVEL = 1
_MAX_LEVEL = 90

LevelCandidate = tuple[int, float, str, int]


@dataclass(frozen=True)
class LevelOCRResult:
    raw_text: str
    confidence: float
    level: int | None
    route: str


def parse_level(
    raw_text: str,
    confidence: float,
    *,
    low_confidence_level_one: float | None = None,
) -> int | None:
    """Parse a game level and enforce the route invariant ``1 <= Lv <= 90``."""
    stripped = _LV_PREFIX_RE.sub("", raw_text).strip()
    level = parse_ocr_result(stripped, confidence)
    if level is None and low_confidence_level_one is not None:
        parsed = parse_quantity_string(stripped)
        if parsed == 1 and confidence >= low_confidence_level_one:
            level = 1
    if level is None or not (_MIN_LEVEL <= level <= _MAX_LEVEL):
        return None
    return level


def _rank_candidates(
    candidates: Sequence[LevelCandidate],
) -> list[tuple[int, dict[str, object]]]:
    grouped: dict[int, dict[str, object]] = {}
    for level, confidence, raw_text, crop_index in candidates:
        data = grouped.setdefault(
            level,
            {"crops": set(), "max_conf": 0.0, "best_raw": ""},
        )
        crops = data["crops"]
        assert isinstance(crops, set)
        crops.add(crop_index)
        if confidence > data["max_conf"]:
            data["max_conf"] = confidence
            data["best_raw"] = raw_text
    return sorted(
        grouped.items(),
        key=lambda item: (
            -len(item[1]["crops"]),
            -len(str(item[0])),
            -float(item[1]["max_conf"]),
        ),
    )


def _consensus(
    candidates: Sequence[LevelCandidate],
    *,
    min_crops: int,
    min_confidence: float,
) -> tuple[str, float, int] | None:
    ranked = _rank_candidates(candidates)
    if not ranked:
        return None
    level, data = ranked[0]
    crop_count = len(data["crops"])
    second_count = len(ranked[1][1]["crops"]) if len(ranked) > 1 else 0
    confidence = float(data["max_conf"])
    if (
        crop_count >= min_crops
        and crop_count > second_count
        and confidence >= min_confidence
    ):
        return str(data["best_raw"]), confidence, level
    return None


def _best_available(
    candidates: Sequence[LevelCandidate],
) -> tuple[str, float, int] | None:
    ranked = _rank_candidates(candidates)
    if not ranked:
        return None
    level, data = ranked[0]
    return str(data["best_raw"]), float(data["max_conf"]), level


def ocr_level_cascade(
    canvas: np.ndarray,
    bbox: tuple[int, int, int, int],
    target_h: int,
    crop_fracs: Sequence[float],
    *,
    prepare: Callable[[np.ndarray], np.ndarray] | None = None,
    try_no_det: bool = False,
    low_confidence_level_one: float | None = None,
) -> LevelOCRResult:
    """Recognize a level with fast profiles first and accurate OCR as fallback.

    A fast result is accepted only after two distinct crop ratios agree. The
    accurate profile preserves the old detector as the final authority for
    difficult single digits and low-contrast text.
    """
    x, y, w, h = bbox
    canvas_h = canvas.shape[0]
    eff_h = min(max(h, target_h), canvas_h - y)
    variants: list[np.ndarray] = []
    for crop_frac in crop_fracs:
        region = canvas[y + int(eff_h * crop_frac) : y + eff_h, x : x + w]
        if region.size == 0:
            continue
        variants.append(prepare(region) if prepare is not None else region)

    if not variants:
        return LevelOCRResult("", 0.0, None, "unknown")

    first_raw = ""
    first_confidence = 0.0

    def run_profile(
        route: str,
        *,
        use_text_det: bool,
        detector_profile: DetectorProfile = "accurate",
        accept_consensus: bool,
    ) -> tuple[LevelOCRResult | None, list[LevelCandidate]]:
        nonlocal first_raw, first_confidence
        candidates: list[LevelCandidate] = []
        for crop_index, variant in enumerate(variants):
            raw_text, confidence = ocr_digits(
                variant,
                use_text_det=use_text_det,
                detector_profile=detector_profile,
            )
            if not first_raw and raw_text:
                first_raw, first_confidence = raw_text, confidence
            level = parse_level(
                raw_text,
                confidence,
                low_confidence_level_one=low_confidence_level_one,
            )
            if level is not None:
                candidates.append((level, confidence, raw_text, crop_index))
            if accept_consensus and crop_index >= 1:
                accepted = _consensus(
                    candidates,
                    min_crops=2,
                    min_confidence=0.50,
                )
                if accepted is not None:
                    raw, conf, accepted_level = accepted
                    return LevelOCRResult(raw, conf, accepted_level, route), candidates
        return None, candidates

    if try_no_det:
        accepted, _ = run_profile(
            "no_det",
            use_text_det=False,
            accept_consensus=True,
        )
        if accepted is not None:
            return accepted

    accepted, _ = run_profile(
        "fast_detector",
        use_text_det=True,
        detector_profile="fast",
        accept_consensus=True,
    )
    if accepted is not None:
        return accepted

    _, accurate_candidates = run_profile(
        "accurate_detector",
        use_text_det=True,
        detector_profile="accurate",
        accept_consensus=False,
    )
    best = _best_available(accurate_candidates)
    if best is None:
        _, legacy_candidates = run_profile(
            "legacy_detector",
            use_text_det=True,
            detector_profile="legacy",
            accept_consensus=False,
        )
        best = _best_available(legacy_candidates)
    if best is None:
        return LevelOCRResult(first_raw, first_confidence, None, "unknown")
    raw, confidence, level = best
    route = "accurate_detector" if accurate_candidates else "legacy_detector"
    return LevelOCRResult(raw, confidence, level, route)
