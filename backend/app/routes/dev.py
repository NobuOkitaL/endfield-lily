# backend/app/routes/dev.py
from __future__ import annotations

import base64
import binascii
import io
import json
from pathlib import Path

import cv2
import numpy as np
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from PIL import Image
from pydantic import BaseModel

from app.pipelines.grid_detect import detect_slots
from app.pipelines.preprocess import CANVAS_H, CANVAS_W

router = APIRouter(prefix="/dev", tags=["dev"])

_ASSETS_DIR = Path(__file__).resolve().parent.parent / "assets"

# Minimum slot dimension (px) on the 1080p normalized canvas. 贵重品库 slots
# are ~147px but 武陵仓库 main-grid slots are ~68px, so we floor at 50 to let
# both pass. Anything below 50 is almost certainly UI chrome / noise.
_MIN_SLOT_DIM = 50

_VALID_ASSET_TYPES = {"materials", "operators", "weapons"}

# Close-kernel size per asset type. 武陵仓库 (materials) has small slots
# (~68px) that need a 7×7 to surface, but operator / weapon cards were
# labelled at the 5×5 geometry — changing their kernel invalidates
# already-captured templates, so we pin them to 5.
_CLOSE_KERNEL_BY_ASSET = {"materials": 7, "operators": 5, "weapons": 5}


def _assets_dir() -> Path:
    """Return the assets directory. Overridable in tests."""
    return _ASSETS_DIR


def _asset_json_path(asset_type: str) -> Path:
    return _assets_dir() / f"{asset_type}.json"


def _asset_subdir_path(asset_type: str) -> Path:
    return _assets_dir() / asset_type


def _labeled_json_path(asset_type: str) -> Path:
    """Tracker of names that have been captured via the labeling tool.
    Kept separate from `{asset_type}.json` so the shipped name→file mapping
    isn't mistaken for user-captured state."""
    return _assets_dir() / f"{asset_type}.labeled.json"


def _load_labeled(asset_type: str) -> set[str]:
    path = _labeled_json_path(asset_type)
    if not path.exists():
        return set()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, list):
            return {str(x) for x in data}
        return set()
    except Exception:
        return set()


def _save_labeled(asset_type: str, labeled: set[str]) -> None:
    path = _labeled_json_path(asset_type)
    path.write_text(
        json.dumps(sorted(labeled), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def _validate_asset_type(asset_type: str) -> None:
    if asset_type not in _VALID_ASSET_TYPES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unknown asset_type '{asset_type}'. "
                f"Expected one of: {sorted(_VALID_ASSET_TYPES)}"
            ),
        )


def _decode_upload(file_bytes: bytes) -> np.ndarray:
    try:
        pil_img = Image.open(io.BytesIO(file_bytes))
        pil_img = pil_img.convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image: {e}")
    arr = np.array(pil_img)
    return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)


def _scale_color(bgr: np.ndarray) -> np.ndarray:
    """Scale a BGR image the same way load_and_normalize scales its grayscale output."""
    h, w = bgr.shape[:2]
    scale = min(CANVAS_H / h, CANVAS_W / w)
    new_w = int(round(w * scale))
    new_h = int(round(h * scale))
    return cv2.resize(bgr, (new_w, new_h), interpolation=cv2.INTER_AREA)


@router.get("/{asset_type}/names")
async def list_names(asset_type: str):
    """Return valid names + whether each has already been captured by the
    labeling tool. Shape: {"names": [{"name": str, "labeled": bool}, ...]}."""
    _validate_asset_type(asset_type)
    json_path = _asset_json_path(asset_type)
    if not json_path.exists():
        raise HTTPException(
            status_code=500, detail=f"{asset_type}.json not found"
        )
    try:
        mapping: dict[str, str] = json.loads(json_path.read_text(encoding="utf-8"))
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to read {asset_type}.json: {e}"
        )
    labeled = _load_labeled(asset_type)
    return {
        "names": [
            {"name": n, "labeled": n in labeled} for n in mapping.keys()
        ]
    }


@router.get("/{asset_type}/templates/{name}/image")
async def get_template_image(asset_type: str, name: str):
    """Serve the raw PNG of a labeled template so the label-tool can preview
    existing captures. 404 if missing."""
    _validate_asset_type(asset_type)
    path = _asset_subdir_path(asset_type) / f"{name}.png"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"no template for {name}")
    return FileResponse(path, media_type="image/png")


@router.delete("/{asset_type}/templates/{name}")
async def delete_template(asset_type: str, name: str):
    """Remove a previously-captured template: deletes the PNG file and drops
    the name from `{asset_type}.labeled.json`. The `{asset_type}.json` name-
    mapping is intentionally left alone (its path will simply 404 on load)."""
    _validate_asset_type(asset_type)
    labeled = _load_labeled(asset_type)
    if name not in labeled:
        raise HTTPException(
            status_code=404, detail=f"{name} is not labeled"
        )
    png_path = _asset_subdir_path(asset_type) / f"{name}.png"
    if png_path.exists():
        png_path.unlink()
    labeled.discard(name)
    _save_labeled(asset_type, labeled)
    return {"deleted": name}


@router.post("/{asset_type}/extract-slots")
async def extract_slots(asset_type: str, image: UploadFile = File(...)):
    _validate_asset_type(asset_type)
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=415, detail="Expected an image upload")

    raw = await image.read()
    bgr = _decode_upload(raw)
    color_canvas = _scale_color(bgr)
    gray_canvas = cv2.cvtColor(color_canvas, cv2.COLOR_BGR2GRAY)
    slots = detect_slots(gray_canvas, close_kernel=_CLOSE_KERNEL_BY_ASSET[asset_type])

    slots_sorted = sorted(slots, key=lambda b: (b[1], b[0]))

    results: list[dict] = []
    for idx, (x, y, w, h) in enumerate(slots_sorted):
        if w < _MIN_SLOT_DIM or h < _MIN_SLOT_DIM:
            continue
        icon_h = int(h * 0.7)
        icon = color_canvas[y : y + icon_h, x : x + w]
        if icon.size == 0:
            continue
        success, buf = cv2.imencode(".png", icon)
        if not success:
            continue
        b64 = base64.b64encode(buf.tobytes()).decode("ascii")
        results.append(
            {
                "index": idx,
                "bbox": [int(x), int(y), int(w), int(h)],
                "icon_base64": b64,
            }
        )
    # Re-index so consumer sees contiguous indices
    for i, r in enumerate(results):
        r["index"] = i
    return {"slots": results}


class SaveTemplateEntry(BaseModel):
    name: str
    icon_base64: str


class SaveTemplatesRequest(BaseModel):
    entries: list[SaveTemplateEntry]
    # When false (default), entries whose name is already in the labeled
    # tracker are skipped to avoid silently clobbering a prior capture.
    # When true, those entries overwrite the existing PNG. The label-tool
    # surfaces a confirmation dialog before sending the second-pass request.
    overwrite: bool = False


@router.post("/{asset_type}/save-templates")
async def save_templates(asset_type: str, req: SaveTemplatesRequest):
    _validate_asset_type(asset_type)

    json_path = _asset_json_path(asset_type)
    subdir = _asset_subdir_path(asset_type)

    if not json_path.exists():
        raise HTTPException(
            status_code=500, detail=f"{asset_type}.json not found"
        )

    try:
        mapping: dict[str, str] = json.loads(json_path.read_text(encoding="utf-8"))
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to read {asset_type}.json: {e}"
        )

    valid_names = set(mapping.keys())

    if not req.entries:
        raise HTTPException(status_code=400, detail="entries must not be empty")

    for entry in req.entries:
        if entry.name not in valid_names:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown name for {asset_type}: {entry.name}",
            )
        if not entry.icon_base64:
            raise HTTPException(
                status_code=400,
                detail=f"Empty icon_base64 for {entry.name}",
            )

    subdir.mkdir(parents=True, exist_ok=True)

    labeled = _load_labeled(asset_type)
    saved = 0
    skipped: list[str] = []
    overwritten: list[str] = []
    newly_labeled: set[str] = set()

    for entry in req.entries:
        already_labeled = entry.name in labeled
        if already_labeled and not req.overwrite:
            skipped.append(entry.name)
            continue
        try:
            png_bytes = base64.b64decode(entry.icon_base64, validate=True)
        except (binascii.Error, ValueError) as e:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid base64 for {entry.name}: {e}",
            )
        arr = np.frombuffer(png_bytes, dtype=np.uint8)
        decoded = cv2.imdecode(arr, cv2.IMREAD_UNCHANGED)
        if decoded is None:
            raise HTTPException(
                status_code=400,
                detail=f"Could not decode PNG for {entry.name}",
            )
        out_path = subdir / f"{entry.name}.png"
        success = cv2.imwrite(str(out_path), decoded)
        if not success:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to write PNG for {entry.name}",
            )
        mapping[entry.name] = f"{asset_type}/{entry.name}.png"
        if already_labeled:
            overwritten.append(entry.name)
        else:
            newly_labeled.add(entry.name)
            saved += 1

    if newly_labeled or overwritten:
        json_path.write_text(
            json.dumps(mapping, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        if newly_labeled:
            _save_labeled(asset_type, labeled | newly_labeled)

    return {"saved": saved, "skipped": skipped, "overwritten": overwritten}
