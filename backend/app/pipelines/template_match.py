# backend/app/pipelines/template_match.py
"""
Template matching for material / operator / weapon slot icons.

This is a port of the approach used by arkntools/depot-recognition (MIT):
normalize both template and query to a 100x100 BGRA thumbnail by the
*same* pipeline (central-region crop → Gaussian blur → resize → quantity
mask → circular mask), then compare as a pixelmatch-style per-pixel RGB
diff ratio.  Pixels where either side is transparent are skipped, so the
quantity-text region and rarity-frame corners never enter the comparison.

Semantics of MatchResult.confidence:
    confidence = 1.0 - diff_ratio
so higher is better and a threshold like 0.80 corresponds to roughly
"at most 20% of compared pixels disagree significantly."  This preserves
the >= threshold convention callers already use.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# All normalized thumbnails live in this square.
_THUMB_SIZE = 100

# Default quantity-text mask rect in the 100x100 thumbnail space.
# Bottom-center strip where Endfield inventory slots render the stack count
# and where operator/weapon cards render level text.  Applying the same mask
# to both template and query keeps the pixel comparison symmetric.
DEFAULT_QUANTITY_MASK = (20, 72, 60, 22)  # (x, y, w, h)

# Fraction of each edge to crop off when loading a raw game asset (PNG) that
# includes the rarity frame around the icon.  Query slots coming off the
# pipeline are already cropped to the icon region and skip this step.
_TEMPLATE_OUTER_FRAME_CROP = 0.08  # → keep central 84% (8% off each side)

# Per-pixel threshold (fraction of 255*3) above which an L1 RGB difference
# counts as "this pixel disagrees."
_PIXEL_DIFF_THRESHOLD = 0.2

# If the gap between best and second-best diff ratio is under this, the
# match is flagged ambiguous (depot-recognition's signal).
_AMBIGUOUS_GAP = 0.005


# ---------------------------------------------------------------------------
# Circular alpha mask (100x100 uint8, 255 inside inscribed circle)
# ---------------------------------------------------------------------------

def _build_circle_mask() -> np.ndarray:
    m = np.zeros((_THUMB_SIZE, _THUMB_SIZE), dtype=np.uint8)
    cv2.circle(m, (_THUMB_SIZE // 2, _THUMB_SIZE // 2), _THUMB_SIZE // 2, 255, -1)
    return m


_CIRCLE_MASK: np.ndarray = _build_circle_mask()


# ---------------------------------------------------------------------------
# Thumbnail normalization
# ---------------------------------------------------------------------------

def _to_bgra(img: np.ndarray) -> np.ndarray:
    """Coerce any 1/3/4-channel uint8 input into BGRA uint8."""
    if img.ndim == 2:
        bgr = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
        alpha = np.full(img.shape, 255, dtype=np.uint8)
        return np.dstack([bgr, alpha])
    if img.ndim == 3 and img.shape[2] == 3:
        alpha = np.full(img.shape[:2], 255, dtype=np.uint8)
        return np.dstack([img, alpha])
    if img.ndim == 3 and img.shape[2] == 4:
        return img
    raise ValueError(f"unsupported image shape: {img.shape}")


def _normalize_thumbnail(
    img: np.ndarray,
    *,
    is_template: bool = False,
    quantity_mask: tuple[int, int, int, int] = DEFAULT_QUANTITY_MASK,
) -> np.ndarray:
    """
    Produce a 100x100 BGRA uint8 thumbnail for pixel-diff comparison.

    - is_template=True: input is a raw game asset with an outer rarity frame;
      crop the central (1 - 2*_TEMPLATE_OUTER_FRAME_CROP) region first.
    - is_template=False: input is already a slot crop from the pipeline
      (no frame to remove); skip the outer crop.

    Alpha channel is set so pixels are transparent (0) outside the inscribed
    circle OR inside the quantity mask rect; opaque (255) otherwise.  That
    way _diff_ratio naturally skips those pixels.
    """
    bgra = _to_bgra(img)

    if is_template:
        h, w = bgra.shape[:2]
        cx0 = int(w * _TEMPLATE_OUTER_FRAME_CROP)
        cx1 = int(w * (1.0 - _TEMPLATE_OUTER_FRAME_CROP))
        cy0 = int(h * _TEMPLATE_OUTER_FRAME_CROP)
        cy1 = int(h * (1.0 - _TEMPLATE_OUTER_FRAME_CROP))
        if cx1 > cx0 and cy1 > cy0:
            bgra = bgra[cy0:cy1, cx0:cx1]

    # Gaussian blur kills JPEG / compression noise before resize.
    blurred = cv2.GaussianBlur(bgra, (5, 5), 0)

    # Resize to the canonical 100x100 space.
    resized = cv2.resize(
        blurred,
        (_THUMB_SIZE, _THUMB_SIZE),
        interpolation=cv2.INTER_CUBIC,
    )

    # Build the final alpha: original alpha ∧ circle ∧ NOT(quantity rect).
    alpha = resized[..., 3].copy()
    # Intersect with circle
    alpha = cv2.bitwise_and(alpha, _CIRCLE_MASK)
    # Zero the quantity rect
    qx, qy, qw, qh = quantity_mask
    qx = max(0, min(_THUMB_SIZE, qx))
    qy = max(0, min(_THUMB_SIZE, qy))
    qx2 = max(0, min(_THUMB_SIZE, qx + qw))
    qy2 = max(0, min(_THUMB_SIZE, qy + qh))
    if qx2 > qx and qy2 > qy:
        alpha[qy:qy2, qx:qx2] = 0

    out = resized.copy()
    out[..., 3] = alpha
    return out


# ---------------------------------------------------------------------------
# Pixelmatch-style diff
# ---------------------------------------------------------------------------

def _diff_ratio(
    a_bgra: np.ndarray,
    b_bgra: np.ndarray,
    per_pixel_threshold: float = _PIXEL_DIFF_THRESHOLD,
) -> float:
    """
    Fraction of opaque-in-both pixels where L1 RGB distance exceeds
    per_pixel_threshold * 255 * 3.  Returns 1.0 (max possible diff) when
    there is no overlapping opaque region.
    """
    mask = (a_bgra[..., 3] > 0) & (b_bgra[..., 3] > 0)
    total = int(mask.sum())
    if total == 0:
        return 1.0
    diff = np.abs(
        a_bgra[..., :3].astype(np.int32) - b_bgra[..., :3].astype(np.int32)
    ).sum(axis=-1)
    thresh = per_pixel_threshold * 255 * 3
    bad = int(((diff > thresh) & mask).sum())
    return float(bad) / float(total)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

@dataclass
class MatchResult:
    material_id: str | None
    confidence: float
    diffs_too_close: bool = field(default=False)


class TemplateLibrary:
    """A store of id → pre-normalized 100x100 BGRA template thumbnail."""

    def __init__(self, templates: dict[str, np.ndarray] | None = None):
        # Pre-normalize everything at construction time so match_slot is
        # pure pixel math.  In-memory templates are treated as slot-shaped
        # (no outer frame) — this mirrors how the endpoint tests build the
        # library from pipeline slot crops.
        self._templates: dict[str, np.ndarray] = {}
        for name, arr in (templates or {}).items():
            self._templates[name] = _normalize_thumbnail(arr, is_template=False)

    @classmethod
    def from_directory(
        cls,
        assets_dir: Path,
        mapping_file: Path,
    ) -> "TemplateLibrary":
        """
        Load templates from a directory using a JSON mapping {name: rel_path}.
        Paths are resolved relative to ``assets_dir.parent`` (the mapping
        values look like ``"materials/foo.png"``).  PNGs are loaded with
        alpha preserved and normalized via the is_template=True path so the
        rarity-frame outer ring is cropped off before comparison.
        """
        mapping = json.loads(mapping_file.read_text(encoding="utf-8"))
        lib = cls.__new__(cls)
        lib._templates = {}
        for name, rel in mapping.items():
            path = assets_dir.parent / rel  # rel is like "materials/xxx.png"
            img = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
            if img is None:
                continue
            lib._templates[name] = _normalize_thumbnail(img, is_template=True)
        return lib

    def items(self):
        return self._templates.items()

    def __len__(self) -> int:
        return len(self._templates)


def match_slot(
    slot: np.ndarray,
    library: TemplateLibrary,
    threshold: float = 0.80,
    *,
    quantity_mask: tuple[int, int, int, int] = DEFAULT_QUANTITY_MASK,
) -> MatchResult:
    """
    Pixelmatch-style match of ``slot`` against every entry in ``library``.

    ``slot`` may be 1/3/4-channel uint8.  It is normalized to the same
    100x100 BGRA thumbnail as the library entries, then compared by the
    fraction of opaque-in-both pixels whose L1 RGB distance exceeds the
    per-pixel threshold.

    Returns ``MatchResult(material_id, confidence, diffs_too_close)`` where
    ``confidence = 1 - best_diff_ratio`` (higher is better).  When confidence
    is below ``threshold`` the material_id is ``None``.
    """
    if len(library) == 0:
        return MatchResult(material_id=None, confidence=0.0)

    query = _normalize_thumbnail(slot, is_template=False, quantity_mask=quantity_mask)

    best_id: str | None = None
    best_diff: float = float("inf")
    second_best_diff: float = float("inf")
    for name, tpl in library.items():
        d = _diff_ratio(query, tpl)
        if d < best_diff:
            second_best_diff = best_diff
            best_diff = d
            best_id = name
        elif d < second_best_diff:
            second_best_diff = d

    confidence = 1.0 - best_diff
    diffs_too_close = (
        best_id is not None
        and second_best_diff != float("inf")
        and abs(best_diff - second_best_diff) < _AMBIGUOUS_GAP
    )

    if confidence >= threshold:
        return MatchResult(
            material_id=best_id,
            confidence=confidence,
            diffs_too_close=diffs_too_close,
        )
    return MatchResult(
        material_id=None,
        confidence=confidence,
        diffs_too_close=diffs_too_close,
    )
