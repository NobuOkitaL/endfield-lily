"""End-to-end timing harness for /recognize/inventory.

This script bypasses HTTP by calling the FastAPI route handler directly, then
prints JSON with per-stage timings, recognized items and unknowns, and OCR
samples for each input screenshot.

Usage:
    cd backend
    .venv/bin/python scripts/benchmark_ocr.py --mode current \
        ~/Downloads/screenshot.png [...more screenshots]

`--mode no-det` monkeypatches the OCR engine to RapidOCR with
`use_text_det=False`. It is kept as a knob for future experiments; the
production inventory path no longer uses this mode globally and instead uses
the hybrid fast/fallback split per slot.

Requires private game screenshots that are not stored in this repository.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.pipelines import ocr as ocr_mod  # noqa: E402
from app.routes import inventory as inventory_route  # noqa: E402


@dataclass
class Metrics:
    preprocess_seconds: float = 0.0
    detect_slots_seconds: float = 0.0
    template_match_seconds: float = 0.0
    ocr_seconds: float = 0.0
    template_match_calls: int = 0
    ocr_calls: int = 0
    ocr_samples: list[dict[str, Any]] = field(default_factory=list)


class FakeUploadFile:
    content_type = "image/png"

    def __init__(self, data: bytes) -> None:
        self._data = data

    async def read(self) -> bytes:
        return self._data


def _configure_engine(mode: str) -> None:
    if mode == "current":
        ocr_mod._engine = None  # type: ignore[attr-defined]
        ocr_mod._get_engine()
        return

    from rapidocr_onnxruntime import RapidOCR

    ocr_mod._engine = RapidOCR(  # type: ignore[attr-defined]
        use_text_det=False,
        text_score=0.1,
        det_model_path=None,
        det_box_thresh=0.1,
        det_unclip_ratio=3.0,
    )


def _time_call(metrics: Metrics, attr: str, func: Callable[..., Any]) -> Callable[..., Any]:
    def wrapped(*args: Any, **kwargs: Any) -> Any:
        started = time.perf_counter()
        try:
            return func(*args, **kwargs)
        finally:
            setattr(metrics, attr, getattr(metrics, attr) + time.perf_counter() - started)

    return wrapped


def _install_timers(metrics: Metrics) -> dict[str, Callable[..., Any]]:
    originals = {
        "load_and_normalize": inventory_route.load_and_normalize,
        "detect_slots": inventory_route.detect_slots,
        "match_slot": inventory_route.match_slot,
        "ocr_digits": inventory_route.ocr_digits,
    }

    def timed_match_slot(*args: Any, **kwargs: Any) -> Any:
        metrics.template_match_calls += 1
        return _time_call(metrics, "template_match_seconds", originals["match_slot"])(
            *args, **kwargs
        )

    def timed_ocr_digits(*args: Any, **kwargs: Any) -> Any:
        metrics.ocr_calls += 1
        started = time.perf_counter()
        text, confidence = originals["ocr_digits"](*args, **kwargs)
        elapsed = time.perf_counter() - started
        metrics.ocr_seconds += elapsed
        metrics.ocr_samples.append(
            {
                "text": text,
                "confidence": confidence,
                "seconds": elapsed,
            }
        )
        return text, confidence

    inventory_route.load_and_normalize = _time_call(
        metrics, "preprocess_seconds", originals["load_and_normalize"]
    )
    inventory_route.detect_slots = _time_call(
        metrics, "detect_slots_seconds", originals["detect_slots"]
    )
    inventory_route.match_slot = timed_match_slot
    inventory_route.ocr_digits = timed_ocr_digits
    return originals


def _restore_timers(originals: dict[str, Callable[..., Any]]) -> None:
    inventory_route.load_and_normalize = originals["load_and_normalize"]
    inventory_route.detect_slots = originals["detect_slots"]
    inventory_route.match_slot = originals["match_slot"]
    inventory_route.ocr_digits = originals["ocr_digits"]


def _summarize_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "material_id": item.get("material_id"),
            "quantity": item.get("quantity"),
            "confidence": item.get("confidence"),
            "bbox": item.get("bbox"),
        }
        for item in items
    ]


def _summarize_unknowns(unknowns: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "bbox": item.get("bbox"),
            "best_guess_material_id": item.get("best_guess_material_id"),
            "best_guess_quantity": item.get("best_guess_quantity"),
            "best_guess_confidence": item.get("best_guess_confidence"),
            "raw_ocr_text": item.get("raw_ocr_text"),
        }
        for item in unknowns
    ]


async def _run_one(path: Path) -> dict[str, Any]:
    metrics = Metrics()
    originals = _install_timers(metrics)
    total_started = time.perf_counter()
    try:
        result = await inventory_route.recognize_inventory(FakeUploadFile(path.read_bytes()))
    finally:
        total_seconds = time.perf_counter() - total_started
        _restore_timers(originals)

    items = result.get("items", [])
    unknowns = result.get("unknowns", [])
    known_stage_seconds = (
        metrics.preprocess_seconds
        + metrics.detect_slots_seconds
        + metrics.template_match_seconds
        + metrics.ocr_seconds
    )
    return {
        "path": str(path),
        "total_seconds": total_seconds,
        "stages": {
            "preprocess_seconds": metrics.preprocess_seconds,
            "detect_slots_seconds": metrics.detect_slots_seconds,
            "template_match_seconds": metrics.template_match_seconds,
            "ocr_seconds": metrics.ocr_seconds,
            "other_seconds": max(total_seconds - known_stage_seconds, 0.0),
        },
        "calls": {
            "template_match": metrics.template_match_calls,
            "ocr": metrics.ocr_calls,
        },
        "items_count": len(items),
        "unknowns_count": len(unknowns),
        "items": _summarize_items(items),
        "unknowns": _summarize_unknowns(unknowns),
        "ocr_samples": metrics.ocr_samples,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=("current", "no-det"), required=True)
    parser.add_argument("screenshots", nargs="+", type=Path)
    args = parser.parse_args()

    _configure_engine(args.mode)
    output = {
        "mode": args.mode,
        "screenshots": [asyncio.run(_run_one(path)) for path in args.screenshots],
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
