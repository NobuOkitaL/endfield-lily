# backend/app/pipelines/template_match.py
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np


@dataclass
class MatchResult:
    material_id: str | None
    confidence: float


class TemplateLibrary:
    """A dict-like store of id → grayscale template image."""

    def __init__(self, templates: dict[str, np.ndarray] | None = None):
        self._templates: dict[str, np.ndarray] = dict(templates or {})

    @classmethod
    def from_directory(cls, assets_dir: Path, mapping_file: Path) -> "TemplateLibrary":
        """Load templates from a directory using a JSON mapping {name: rel_path}."""
        mapping = json.loads(mapping_file.read_text(encoding="utf-8"))
        templates: dict[str, np.ndarray] = {}
        for name, rel in mapping.items():
            path = assets_dir.parent / rel  # rel is like "materials/xxx.png"
            img = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
            if img is None:
                continue
            templates[name] = img
        return cls(templates)

    def items(self):
        return self._templates.items()

    def __len__(self) -> int:
        return len(self._templates)


def match_slot(
    slot: np.ndarray,
    library: TemplateLibrary,
    threshold: float = 0.85,
) -> MatchResult:
    """
    Match a slot region against every template in the library.
    Returns the best match if its score >= threshold, otherwise unknown.
    """
    if len(library) == 0:
        return MatchResult(material_id=None, confidence=0.0)

    if slot.ndim == 3:
        slot = cv2.cvtColor(slot, cv2.COLOR_BGR2GRAY)

    best_id: str | None = None
    best_score: float = -1.0
    best_diff: float = float("inf")
    for name, tpl in library.items():
        # If template is larger than the slot in either dimension, downscale it
        if tpl.shape[0] > slot.shape[0] or tpl.shape[1] > slot.shape[1]:
            scale = min(slot.shape[0] / tpl.shape[0], slot.shape[1] / tpl.shape[1]) * 0.9
            new_w = max(1, int(tpl.shape[1] * scale))
            new_h = max(1, int(tpl.shape[0] * scale))
            tpl = cv2.resize(tpl, (new_w, new_h), interpolation=cv2.INTER_AREA)
        res = cv2.matchTemplate(slot, tpl, cv2.TM_CCOEFF_NORMED)
        _, max_val, _, max_loc = cv2.minMaxLoc(res)
        # Secondary score: mean absolute pixel difference at the best match location
        # (lower is better) — used to break ties between templates of identical structure
        th, tw = tpl.shape[:2]
        y, x = max_loc[1], max_loc[0]
        region = slot[y : y + th, x : x + tw].astype(np.float32)
        diff = float(np.mean(np.abs(region - tpl.astype(np.float32))))
        # Use a small epsilon for near-ties; prefer lower pixel diff (exact match)
        _EPS = 1e-5
        if max_val > best_score + _EPS or (
            abs(max_val - best_score) <= _EPS and diff < best_diff
        ):
            best_score = float(max_val)
            best_diff = diff
            best_id = name

    if best_score >= threshold:
        return MatchResult(material_id=best_id, confidence=best_score)
    return MatchResult(material_id=None, confidence=best_score)
