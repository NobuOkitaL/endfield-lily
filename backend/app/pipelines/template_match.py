# backend/app/pipelines/template_match.py
"""
Template matching for material / operator / weapon slot icons.

Port of arkntools/depot-recognition (MIT): normalize both template and query
to a 100x100 BGRA thumbnail by the *same symmetric* pipeline (Gaussian blur
→ resize → quantity mask → circular mask), then compare as a pixelmatch-
style per-pixel RGB diff ratio. Pixels where either side is transparent are
skipped, so the quantity-text region and rarity-frame corners never enter
the comparison.

Templates MUST come from the labeling tool (crops of in-game slot icons at
pipeline scale). Original static end.wiki PNGs with external rarity frames
will not match well — they get fed through the same no-crop normalization
as slots, so the frame pixels pollute the diff.

Semantics of MatchResult.confidence: confidence = 1.0 - diff_ratio.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np

_log = logging.getLogger(__name__)


def _imread_unicode(path: Path) -> np.ndarray | None:
    """Unicode-safe replacement for ``cv2.imread``. OpenCV's imread on Windows
    routes through ANSI string APIs and silently fails on non-ASCII paths
    (e.g. ``燎石.png``). Reading bytes via ``np.fromfile`` uses Python's
    Unicode-aware I/O, then ``cv2.imdecode`` does the actual decode.
    Mirrors ``IMREAD_UNCHANGED`` so RGBA PNGs keep their alpha channel.
    """
    img, _reason = _imread_unicode_with_reason(path)
    return img


def _imread_unicode_with_reason(path: Path) -> tuple[np.ndarray | None, str | None]:
    try:
        data = np.fromfile(str(path), dtype=np.uint8)
    except OSError as exc:
        return None, str(exc)
    if data.size == 0:
        return None, "file is empty"
    img = cv2.imdecode(data, cv2.IMREAD_UNCHANGED)
    if img is None:
        return None, "cv2.imdecode returned None"
    return img, None


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

# Default selected-operator avatar mask rect in the 100x100 thumbnail space.
# Weapon cards can render the owning operator's round portrait over the
# top-right corner; masking it symmetrically keeps real icon pixels comparable.
DEFAULT_AVATAR_MASK = (68, 0, 32, 44)  # (x, y, w, h)

# Per-pixel threshold (fraction of 255*3) above which an L1 RGB difference
# counts as "this pixel disagrees." depot-recognition uses 0.2, but Endfield's
# tier-colored cards (e.g. 初/中/高级作战记录) differ by only ~20-30 per
# channel — well below the 153 L1 cutoff at 0.2 — so 初级 and 高级 collapse
# to identical. 0.05 (≈38 L1) preserves these subtle hue differences.
_PIXEL_DIFF_THRESHOLD = 0.05

# If the gap between best and second-best diff ratio is under this, the
# match is flagged ambiguous (depot-recognition's signal).
_AMBIGUOUS_GAP = 0.005

# Narrow fallback for wide weapon icon crops whose labeled template is a naked
# detail icon rather than a full slot-card capture.
_EDGE_FALLBACK_TRIGGER_CONFIDENCE = 0.80
_EDGE_FALLBACK_MIN_SCORE = 0.47
_EDGE_FALLBACK_MIN_GAP = 0.05
_EDGE_FALLBACK_CONFIDENCE_SCALE = 0.60
_EDGE_FALLBACK_MIN_ASPECT = 1.20
_EDGE_FALLBACK_MIN_CARD_BG_RATIO = 0.30
_EDGE_FALLBACK_MIN_COLOR_SIMILARITY = 0.35
_EDGE_FALLBACK_SCALES = tuple(np.linspace(0.4, 1.2, 17))


# ---------------------------------------------------------------------------
# Circular alpha mask (100x100 uint8, 255 inside inscribed circle)
# ---------------------------------------------------------------------------

def _build_circle_mask() -> np.ndarray:
    m = np.zeros((_THUMB_SIZE, _THUMB_SIZE), dtype=np.uint8)
    cv2.circle(m, (_THUMB_SIZE // 2, _THUMB_SIZE // 2), _THUMB_SIZE // 2, 255, -1)
    return m


_CIRCLE_MASK: np.ndarray = _build_circle_mask()


def _avatar_mask_for_asset_type(
    asset_type: str | None,
) -> tuple[int, int, int, int] | None:
    return DEFAULT_AVATAR_MASK if asset_type == "weapons" else None


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
    quantity_mask: tuple[int, int, int, int] = DEFAULT_QUANTITY_MASK,
    avatar_mask: tuple[int, int, int, int] | None = DEFAULT_AVATAR_MASK,
) -> np.ndarray:
    """
    Produce a 100x100 BGRA uint8 thumbnail for pixel-diff comparison.

    Symmetric pipeline — applied identically to templates and query slots.
    Alpha is set so pixels are transparent (0) outside the inscribed circle
    OR inside the quantity / avatar mask rects; opaque (255) otherwise.
    _diff_ratio naturally skips those pixels.
    """
    bgra = _to_bgra(img)

    # Gaussian blur kills JPEG / compression noise before resize.
    blurred = cv2.GaussianBlur(bgra, (5, 5), 0)

    # Resize to the canonical 100x100 space.
    resized = cv2.resize(
        blurred,
        (_THUMB_SIZE, _THUMB_SIZE),
        interpolation=cv2.INTER_CUBIC,
    )

    # Build the final alpha: original alpha ∧ circle ∧ NOT(mask rects).
    alpha = resized[..., 3].copy()
    # Intersect with circle
    alpha = cv2.bitwise_and(alpha, _CIRCLE_MASK)
    # Zero the symmetric comparison mask rects.
    for mask_rect in (quantity_mask, avatar_mask):
        if mask_rect is None:
            continue
        qx, qy, qw, qh = mask_rect
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
# Edge overlay fallback
# ---------------------------------------------------------------------------

def _as_bgr(img: np.ndarray) -> np.ndarray:
    return _to_bgra(img)[..., :3]


def _edge_overlay_mask(template_bgr: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(template_bgr, cv2.COLOR_BGR2HSV)
    _h, _s, v = cv2.split(hsv)
    return ((v > 25).astype(np.uint8)) * 255


def _slot_has_light_card_background(slot_bgr: np.ndarray) -> bool:
    hsv = cv2.cvtColor(slot_bgr, cv2.COLOR_BGR2HSV)
    _h, s, v = cv2.split(hsv)
    ratio = float(((v > 160) & (s < 80)).mean())
    return ratio >= _EDGE_FALLBACK_MIN_CARD_BG_RATIO


def _foreground_hs_hist(img_bgr: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
    _h, s, v = cv2.split(hsv)
    mask = ((v > 35) & ~((v > 160) & (s < 80))).astype(np.uint8)
    hist = cv2.calcHist([hsv], [0, 1], mask, [24, 16], [0, 180, 0, 256])
    cv2.normalize(hist, hist)
    return hist


def _foreground_color_similarity(a_bgr: np.ndarray, b_bgr: np.ndarray) -> float:
    return float(
        cv2.compareHist(
            _foreground_hs_hist(a_bgr),
            _foreground_hs_hist(b_bgr),
            cv2.HISTCMP_CORREL,
        )
    )


def _prepare_slot_for_edge_overlay(slot_bgr: np.ndarray) -> np.ndarray:
    out = slot_bgr.copy()
    h, w = out.shape[:2]
    ax, ay, aw, ah = DEFAULT_AVATAR_MASK
    qx, qy, qw, qh = DEFAULT_QUANTITY_MASK
    rects = (
        (
            int(w * ax / _THUMB_SIZE),
            int(h * ay / _THUMB_SIZE),
            int(w * (ax + aw) / _THUMB_SIZE),
            int(h * (ay + ah) / _THUMB_SIZE),
        ),
        (
            int(w * qx / _THUMB_SIZE),
            int(h * qy / _THUMB_SIZE),
            int(w * (qx + qw) / _THUMB_SIZE),
            int(h * (qy + qh) / _THUMB_SIZE),
        ),
    )
    for x1, y1, x2, y2 in rects:
        x1 = max(0, min(w, x1))
        x2 = max(0, min(w, x2))
        y1 = max(0, min(h, y1))
        y2 = max(0, min(h, y2))
        if x2 > x1 and y2 > y1:
            out[y1:y2, x1:x2] = 255
    return out


def _edge_overlay_score(slot_bgr: np.ndarray, template_bgr: np.ndarray) -> float:
    slot_h, slot_w = slot_bgr.shape[:2]
    tpl_h, tpl_w = template_bgr.shape[:2]
    if (
        slot_h == 0
        or tpl_h == 0
        or slot_w / slot_h < _EDGE_FALLBACK_MIN_ASPECT
        or tpl_w / tpl_h < _EDGE_FALLBACK_MIN_ASPECT
        or not _slot_has_light_card_background(slot_bgr)
    ):
        return 0.0

    prepared_slot = _prepare_slot_for_edge_overlay(slot_bgr)
    if (
        _foreground_color_similarity(prepared_slot, template_bgr)
        < _EDGE_FALLBACK_MIN_COLOR_SIMILARITY
    ):
        return 0.0

    query_edges = cv2.Canny(cv2.cvtColor(prepared_slot, cv2.COLOR_BGR2GRAY), 50, 150)
    template_edges = cv2.Canny(
        cv2.cvtColor(template_bgr, cv2.COLOR_BGR2GRAY),
        50,
        150,
    )
    template_mask = _edge_overlay_mask(template_bgr)
    if int(template_mask.sum()) == 0:
        return 0.0

    best = 0.0
    for scale in _EDGE_FALLBACK_SCALES:
        w = max(1, int(tpl_w * scale))
        h = max(1, int(tpl_h * scale))
        if w < 10 or h < 10 or w > slot_w or h > slot_h:
            continue
        resized_edges = cv2.resize(
            template_edges, (w, h), interpolation=cv2.INTER_AREA
        )
        resized_mask = cv2.resize(
            template_mask, (w, h), interpolation=cv2.INTER_NEAREST
        )
        result = cv2.matchTemplate(
            query_edges,
            resized_edges,
            cv2.TM_CCORR_NORMED,
            mask=resized_mask,
        )
        _min_val, max_val, _min_loc, _max_loc = cv2.minMaxLoc(result)
        best = max(best, float(max_val))
    return best


def _best_edge_overlay_match(
    slot: np.ndarray, library: TemplateLibrary
) -> tuple[str | None, float]:
    slot_bgr = _as_bgr(slot)
    best_id: str | None = None
    best_score = 0.0
    second_score = 0.0

    for name, raw_template in library.raw_items():
        score = _edge_overlay_score(slot_bgr, _as_bgr(raw_template))
        if score > best_score:
            second_score = best_score
            best_score = score
            best_id = name
        elif score > second_score:
            second_score = score

    if (
        best_id is not None
        and best_score >= _EDGE_FALLBACK_MIN_SCORE
        and best_score - second_score >= _EDGE_FALLBACK_MIN_GAP
    ):
        return best_id, best_score
    return None, 0.0


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

    def __init__(
        self,
        templates: dict[str, np.ndarray] | None = None,
        *,
        asset_type: str | None = None,
    ):
        # Pre-normalize everything at construction time so match_slot is
        # pure pixel math.
        self._templates: dict[str, np.ndarray] = {}
        self._raw_templates: dict[str, np.ndarray] = {}
        self._asset_type = asset_type
        avatar_mask = _avatar_mask_for_asset_type(self._asset_type)
        for name, arr in (templates or {}).items():
            self._raw_templates[name] = arr
            self._templates[name] = _normalize_thumbnail(arr, avatar_mask=avatar_mask)

    @classmethod
    def from_directory(
        cls,
        assets_dir: Path,
        mapping_file: Path,
    ) -> "TemplateLibrary":
        """
        Load templates from a directory using a JSON mapping {name: rel_path}.
        Paths are resolved relative to ``assets_dir.parent`` (the mapping
        values look like ``"materials/foo.png"``). PNGs should be in-game
        slot crops from the labeling tool (same shape as pipeline slots).
        """
        mapping = json.loads(mapping_file.read_text(encoding="utf-8"))
        lib = cls.__new__(cls)
        lib._templates = {}
        lib._raw_templates = {}
        lib._asset_type = assets_dir.name
        avatar_mask = _avatar_mask_for_asset_type(lib._asset_type)
        for name, rel in mapping.items():
            path = assets_dir.parent / rel
            img, reason = _imread_unicode_with_reason(path)
            if img is None:
                _log.warning(
                    "template load failed for %r at %s: %s",
                    name,
                    path,
                    reason or "unknown reason",
                )
                continue
            lib._raw_templates[name] = img
            lib._templates[name] = _normalize_thumbnail(img, avatar_mask=avatar_mask)
        if not lib._templates:
            _log.warning(
                "template library for %r loaded ZERO templates from %d mapping "
                "entries — all recognition will fall through to unknowns",
                lib._asset_type,
                len(mapping),
            )
        return lib

    def items(self):
        return self._templates.items()

    def raw_items(self):
        return self._raw_templates.items()

    def asset_type(self) -> str | None:
        return self._asset_type

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

    query = _normalize_thumbnail(
        slot,
        quantity_mask=quantity_mask,
        avatar_mask=_avatar_mask_for_asset_type(library.asset_type()),
    )

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
    edge_matched = False
    if (
        library.asset_type() == "weapons"
        and confidence < _EDGE_FALLBACK_TRIGGER_CONFIDENCE
    ):
        edge_id, edge_score = _best_edge_overlay_match(slot, library)
        edge_confidence = min(0.99, edge_score / _EDGE_FALLBACK_CONFIDENCE_SCALE)
        if edge_id is not None and edge_confidence > confidence:
            best_id = edge_id
            confidence = edge_confidence
            edge_matched = True

    diffs_too_close = (
        best_id is not None
        and not edge_matched
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
