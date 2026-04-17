#!/usr/bin/env python3
"""Import icons from reference/zmdgraph into backend assets.

Source: reference/zmdgraph/images/icons/*.png  (material icons)
        reference/zmdgraph/images/avatars/*.png (operator avatars)

Outputs:
  backend/app/assets/materials/<mat_NNN>.png
  backend/app/assets/operators/<op_NNN>.png
  backend/app/assets/materials.json  { "中级作战记录": "materials/mat_008.png", ... }
  backend/app/assets/operators.json  { "洛茜": "operators/op_000.png", ... }

Note: zmdgraph does not have a separate LICENSE file; it is the reference
data source for this project (cloned in Plan A Task 1).  MaaEnd (AGPL-3.0)
was investigated but stores no per-item icon PNGs — it uses OCR / class IDs
for item recognition.  All icon images come from zmdgraph.
"""
from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ZMDGRAPH = ROOT / "reference" / "zmdgraph"
OUT_MATERIALS = ROOT / "backend" / "app" / "assets" / "materials"
OUT_OPERATORS = ROOT / "backend" / "app" / "assets" / "operators"

MAT_TS = ROOT / "frontend" / "src" / "data" / "materials.ts"
OP_TS = ROOT / "frontend" / "src" / "data" / "operators.ts"

# Virtual EXP materials that have no icon (synthesised columns)
VIRTUAL = {"作战记录经验值", "认知载体经验值", "武器经验值"}


def extract_list(ts_file: Path, const_name: str) -> list[str]:
    """Extract a Chinese string array from a TypeScript const declaration."""
    text = ts_file.read_text(encoding="utf-8")
    m = re.search(rf"{const_name}\s*=\s*\[([^\]]+)\]", text, re.DOTALL)
    if not m:
        raise RuntimeError(f"{const_name} not found in {ts_file}")
    return re.findall(r'"([^"]+)"', m.group(1))


def main() -> None:
    OUT_MATERIALS.mkdir(parents=True, exist_ok=True)
    OUT_OPERATORS.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------ #
    # Materials                                                            #
    # ------------------------------------------------------------------ #
    materials = extract_list(MAT_TS, "MATERIAL_COLUMNS")
    print(f"Found {len(materials)} materials in MATERIAL_COLUMNS")

    icon_dir = ZMDGRAPH / "images" / "icons"
    available_icons = {p.stem: p for p in icon_dir.glob("*.png")}

    mat_mapping: dict[str, str] = {}
    mat_missing: list[str] = []

    for idx, name in enumerate(materials):
        if name in VIRTUAL:
            # Virtual EXP materials: no icon expected
            continue
        slug = f"mat_{idx:03d}"
        src = available_icons.get(name)
        if src is None:
            mat_missing.append(name)
            continue
        dst = OUT_MATERIALS / f"{slug}.png"
        shutil.copy(src, dst)
        mat_mapping[name] = f"materials/{slug}.png"

    mat_json = ROOT / "backend" / "app" / "assets" / "materials.json"
    mat_json.write_text(
        json.dumps(mat_mapping, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    non_virtual = len(materials) - len(VIRTUAL)
    print(
        f"Materials: imported {len(mat_mapping)}/{non_virtual} "
        f"(skipped {len(VIRTUAL)} virtual EXP), "
        f"missing {len(mat_missing)}: {mat_missing}"
    )

    # ------------------------------------------------------------------ #
    # Operators                                                            #
    # ------------------------------------------------------------------ #
    operators = extract_list(OP_TS, "CHARACTER_LIST")
    print(f"Found {len(operators)} operators in CHARACTER_LIST")

    avatar_dir = ZMDGRAPH / "images" / "avatars"
    available_avatars = {p.stem: p for p in avatar_dir.glob("*.png")}

    op_mapping: dict[str, str] = {}
    op_missing: list[str] = []

    for idx, name in enumerate(operators):
        slug = f"op_{idx:03d}"
        src = available_avatars.get(name)
        if src is None:
            op_missing.append(name)
            continue
        dst = OUT_OPERATORS / f"{slug}.png"
        shutil.copy(src, dst)
        op_mapping[name] = f"operators/{slug}.png"

    op_json = ROOT / "backend" / "app" / "assets" / "operators.json"
    op_json.write_text(
        json.dumps(op_mapping, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(
        f"Operators: imported {len(op_mapping)}/{len(operators)}, "
        f"missing {len(op_missing)}: {op_missing}"
    )

    # ------------------------------------------------------------------ #
    # Summary / exit code                                                  #
    # ------------------------------------------------------------------ #
    mat_rate = len(mat_mapping) / non_virtual if non_virtual else 0
    op_rate = len(op_mapping) / len(operators) if operators else 0
    print(f"\nImport rates: materials {mat_rate:.0%}, operators {op_rate:.0%}")
    if mat_rate < 0.70:
        raise SystemExit(
            f"ERROR: material import rate {mat_rate:.0%} < 70% threshold — fix the script."
        )
    if op_rate < 0.70:
        raise SystemExit(
            f"ERROR: operator import rate {op_rate:.0%} < 70% threshold — fix the script."
        )
    print("Done.")


if __name__ == "__main__":
    main()
