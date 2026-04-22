# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**总控核心 Lily（Central Core Lily）** — 《明日方舟：终末地》养成规划器。React + TS 前端 + Python 后端（FastAPI + OpenCV + rapidocr-onnxruntime）做截图识别。**数据主源是 [end.wiki](https://end.wiki)**（2026-04-17 从原始 zmdgraph 迁移）。

**品牌 vs 代码标识符**：用户可见的品牌名是 "总控核心 Lily"（HomePage hero、Nav 侧栏、浏览器 tab 标题）。但仓库内部保留 `ZMD` 缩写作为代码层标识符：目录名 `/Users/nobuokita/Desktop/ZMD`、GitHub repo `NobuOkitaL/ZMD`、localStorage key `zmd-planner-state`、pytest config `zmd-backend`。**不要改这些内部 key** —— 改 localStorage key 会清掉所有用户数据。

- **Spec**：`docs/superpowers/specs/2026-04-17-zmd-planner-design.md`
- **Plan A**（前端规划器，已交付 17/17）：`docs/superpowers/plans/2026-04-17-plan-a-planner-frontend.md`
- **Plan B**（后端 + 截图识别，已交付 12/12）：`docs/superpowers/plans/2026-04-17-plan-b-recognition-backend.md`
- **数据源审计**：`docs/research/2026-04-17-data-source-audit.md`（含迁移记录）

### Backend quick ref

- Work dir: `backend/`. Activate venv: `source backend/.venv/bin/activate`.
- Dev server: `uvicorn app.main:app --port 8000 --reload`
- Tests: `pytest` (55 tests across pipeline modules, endpoint integration, weapons endpoint, dev-label endpoints incl. delete, /state cross-browser sync)
- One-command launch both: `./start.sh` at repo root

Endpoints currently registered:
- `POST /recognize/inventory` · `POST /recognize/operators` · `POST /recognize/weapons`
- `POST /dev/{asset_type}/extract-slots` · `POST /dev/{asset_type}/save-templates` · `GET /dev/{asset_type}/names` · `GET /dev/{asset_type}/templates/{name}/image` · `DELETE /dev/{asset_type}/templates/{name}` (see `routes/dev.py`; `asset_type ∈ {materials, operators, weapons}`; used by `label-tool/`)
- `GET /state` · `PUT /state` — cross-browser sync; persisted file is `backend/app/data/state.json` (gitignored via `backend/app/data/`). Sync is **always-on** — the frontend `useBackendSync` hook always runs (no toggle). When the backend is down the hook flips status to `offline`, localStorage keeps working, and the next successful write resumes sync automatically. There is **no `syncToBackend` setting** (removed; persist migration v4→v5 drops the field).

OCR backend is **rapidocr-onnxruntime** (Python 3.14 has no PaddlePaddle wheel; this is the documented fallback). Rapidocr detection params relaxed (`text_score=0.1, box_thresh=0.1, unclip_ratio=3.0`) so isolated single digits ("1" / "5") make it through — defaults dropped them entirely. Confidence floor for parsing is **0.3** (was 0.5); `parse_quantity_string`'s strict digit regex is the real safety net, and it now also rescues leading-punctuation splits like `.80` → 80 (from OCR breaking "Lv.80" into "LV" + ".80"). `ocr_digits` prefers digit-containing detections over label-only (was "highest confidence wins", which dropped the digit when "LV." scored higher).

**Recognition algorithm (current picture)**:
- **Template match** (`template_match.py`) — pixelmatch-style RGBA L1 diff on 100×100 BGRA thumbnails (ported from `arkntools/depot-recognition`, MIT). `_normalize_thumbnail` is **symmetric** for templates and queries (old asymmetric central-84% crop + `is_template` param removed): 5×5 Gaussian blur, 100×100 `INTER_CUBIC`, white rect over quantity region `(x=20,y=72,w=60,h=22)`, circular alpha mask. **Per-pixel threshold 0.05** (was 0.2 from depot-recognition default — collapsed tier-colored EXP cards 初级/中级/高级 to zero diff). `match_slot` returns `confidence = 1 - diff_ratio`; match threshold **0.80**.
- **Color pipeline** (`preprocess.py`) — `load_and_normalize` now returns **BGR 3-channel** (was grayscale); color hue is the primary discriminator between same-shape / different-tint cards. Single-channel input gets promoted to BGR by replication. `detect_slots` internally grayscales for Otsu (transparent to callers).
- **Adaptive Otsu** (`grid_detect.py`) — if canvas mean > 145 (operator / weapon rosters have light backgrounds), use `THRESH_BINARY_INV` so darker cards become foreground; else normal threshold. Inventory stays on the original path. Aspect ratio widened `[0.8, 1.25]` → `[0.6, 1.5]` to admit tall operator portraits (~0.74) alongside square inventory slots (~1.0). Median-based outlier filter drops or splits slots outside `[0.6×, 1.4×] × median`. New `p75_height(slots)` returns the 75th-percentile height — `operators.py` / `weapons.py` use it to **extend the OCR level-text region downward** because Otsu sometimes crops tall cards at the portrait / rarity-strip boundary, losing "Lv.XX" (template matching still uses the original bbox so labeled templates keep matching). `_split_super_slot` is gated by `_SPLIT_MAX_RATIO=3.0` (reject blobs > 3× median — real merges are 2×N, bigger is non-grid) and `_SPLIT_RATIO_TOLERANCE=0.35` (at least one dim must be near-integer multiple of median); otherwise a non-grid blob like the 3D scene outside the 武陵仓库 dialog would get split into a 4×4 of ghost sub-cells.
- **Multi-crop OCR** (inventory / operators / weapons routes) — try bottom 0.30 / 0.40 / 0.50 / 0.60 crops, pick max-digits parse (tie-break by higher confidence). No single ratio works universally: tight crops drop trailing digits, wide crops catch icon silhouettes.
- **Best-guess surfacing** — `match_slot(threshold=0.0)` always populates best guess; strong match (≥0.80) with failed OCR now goes to `items` with quantity/level=0 (was wrongly routed to `unknowns`). Only weak matches fall to `unknowns`, which carry `best_guess_quantity` / `best_guess_level` for frontend dropdown prefill. A "— 不导入 —" option lets users skip rows.

**Labeled-tracker design**: `backend/app/assets/{asset_type}.labeled.json` is kept **separate** from the shipped name→file mapping. It only records which names the dev has captured real-game templates for; the shipped mapping ships with end.wiki renders. `save-templates` skips entries already in the tracker (returns `{saved, skipped[]}`). The label-tool UI reads both to show progress counters and `（已标注）` suffixes.

Recognition only works for labeled assets — anything else gets a low-confidence best-guess in `unknowns`. Current coverage: materials 34/36, operators 9/26, weapons 20/68.

## Commands

All frontend commands run from `frontend/`:

```bash
pnpm dev              # Vite dev server → http://localhost:5173
pnpm build            # tsc -b && vite build
pnpm lint             # ESLint
pnpm test             # Vitest run (all tests, currently 84)
pnpm test:watch       # Vitest watch
pnpm test -- <file>   # Run one test file (e.g. pnpm test -- cost-calc)
```

TypeScript sanity check: `npx tsc --noEmit` (run from `frontend/`).

**`label-tool/` is a separate tree**: Vite + React + TS + Tailwind mini-app (no shadcn, no router) for capturing real-game-screenshot templates. Runs on port **5174** (`strictPort: true`). Zero imports from `frontend/`. CORS in `backend/app/main.py` already allows `:5174`. Don't try to fold it into the main frontend. Has two modes: **自动提取** (drag-and-drop multi-file + backend slot detection + per-card name picker) and **手动标注** (single-image, user draws 1:1 square boxes with move/resize/delete, then a two-phase draw→name flow; crops rendered to 100×100 PNG on the client via canvas `drawImage`, which matches `_normalize_thumbnail`'s target size). Both modes share `/dev/{asset_type}/save-templates`.

Design spec lives in `docs/design/theverge.md`. Project spec + plans under `docs/superpowers/`. `reference/` is clone-space for upstream repos and is **gitignored** — never commit its contents.

**Bleeding-edge stack note**: Vite 8 + React 19 + TS 6 + Tailwind 3. TS 6 has strict flags on (`verbatimModuleSyntax`, `noUnusedLocals`, `erasableSyntaxOnly`) that sometimes trip shadcn-generated code. `tsconfig.json` / `tsconfig.app.json` carry `"ignoreDeprecations": "6.0"` to silence the `baseUrl` deprecation — keep it. When a third-party lib's docs assume React 18 / Vite 5 / Tailwind 4, pin to versions that match this stack instead.

## Architecture

### Data layer is source-of-truth, auto-generated

The four files under `frontend/src/data/` (`materials.ts`, `operators.ts`, `weapons.ts`, `database.ts`) are **auto-generated** from [end.wiki](https://end.wiki) (the primary data source) by `frontend/scripts/port-from-endwiki.mjs`. Do not hand-edit them. To refresh after upstream changes:

```bash
cd frontend
node scripts/port-from-endwiki.mjs all
```

HTTP responses are cached in `frontend/.endwiki-cache/` (gitignored). `operators-helpers.ts` and `types.ts` are hand-written. Generated files carry a `// Auto-generated ... do not edit by hand.` banner.

The legacy `frontend/scripts/port-data.mjs` (which ported from `reference/zmdgraph`) is kept as a read-only reference and is safe to delete after 2026-05-17.

Real counts baked into tests (actual numbers trust the generated data): **39 materials** (incl. 3 virtual EXP — `作战记录经验值`, `认知载体经验值`, `武器经验值` — never stored in stock, computed from EXP cards), **26 operators**, **68 weapons**, **486 DATABASE rows**.

### DATABASE is a flat cost table, not a typed cost tree

The core cost data is a flat array of rows `{干员, 升级项目, 现等级, 目标等级, ...sparse material fields}`. Material fields are sparse — only non-zero materials appear as keys on a row. `cost-calc.ts` (`calculateProjectMaterials`) implements a three-tier lookup algorithm:

1. Try **operator-specific exact match** (same 干员 + 项目 + 现等级 + 目标等级).
2. Fall back to **generic exact match** (`干员 === ""`).
3. Fall back to **per-level accumulation**: sum consecutive `lv → lv+1` rows across that range.

`calculateLevelMaterials` then walks the 5 level bands (`精0等级` 1→20, `精1等级` 20→40, `精2等级` 40→60, `精3等级` 60→80, `精4等级` 80→90), clips each to the query range, and delegates to `calculateProjectMaterials`. **Preserve this fallback order** — it matches upstream and its tests depend on it.

### Store / persistence

`src/store/app-store.ts` is the single Zustand store with `persist` middleware keyed at `zmd-planner-state` in `localStorage`. It holds `stock`, `ownedOperators`, `ownedWeapons`, `planRows`, `settings`. Tests reset via `useAppStore.setState(useAppStore.getInitialState())` — this API needs Zustand **5+** (installed).

Each operator has **10 growth dimensions** (`精英阶段`, `等级`, `装备适配`, `天赋`, `基建`, `信赖`, `技能1..4`). Each weapon has 2 (`破限阶段`, `等级`). The planner's `PlanRow` uses the `PlanProject` union = `UpgradeProject` (from `types.ts`) ∪ `'等级'` ∪ `'破限'`.

Note: `OperatorState` uses `信赖` (simplified field), but the upstream `UpgradeProject` enum spells it `能力值（信赖）` (with parens). The mapping between them lives in `components/planner/CostSummary.tsx` and `AddPlanRowDialog.tsx` — if you touch either, keep the mapping consistent in both.

### UI is dark-only, editorial Verge aesthetic

The app has **no light mode** (intentional — canvas is `#131313`). `AppShell.tsx` force-applies `html.dark`. Full design spec: **`docs/design/theverge.md`** (The Verge brand adapted for this project). Key tokens:

- Hazard accents: Jelly Mint `#3cffd0` + Verge Ultraviolet `#5200ff` — never background washes, never gradients
- Fonts: Anton (display ≥32px) / Hanken Grotesk (UI body) / JetBrains Mono (ALL-CAPS labels, 1.1–1.9px tracking) — loaded from Google Fonts in `frontend/index.html`
- Borders not shadows: 1px hairlines in white/mint/ultraviolet; `box-shadow: none !important` is global in `src/index.css`
- Radii on scale: 2 / 3 / 4 / 20 / 24 / 30 / 40px (+ `50%` for avatars). No square corners.
- Link hover → Deep Link Blue `#3860be` (color-only, no underline)

shadcn/ui components under `src/components/ui/` have been **rewritten** (not zinc defaults): `button.tsx` variants are Jelly Mint Pill (default), Dark Slate Pill (secondary), Outlined Mint 40px (outline), Ultraviolet Outlined (destructive). shadcn config marker is `frontend/components.json` — add new components via `pnpm dlx shadcn@latest add <name>` then re-skin to Verge vocabulary.

Button positioning convention across the app:
- Page headers: primary CTA top-right, same row as the Anton headline (`flex justify-between items-center`)
- Card rows: actions right-aligned (`ml-auto`)
- Dialog footers: destructive on left (`mr-auto`), confirm on right

**Vestigial code:** `settings.darkMode` + `toggleDarkMode` still exist in `app-store.ts` (the Settings page UI that used them was removed when Verge mandated dark-only). The field is harmless but misleading — don't add UI that reads it expecting a toggle to matter. Purge it if you're touching store schema anyway.

### Tests

Co-located `*.test.ts` with the code they cover. Vitest + jsdom. Tests that touch the store call `useAppStore.setState(useAppStore.getInitialState())` in `beforeEach` and `localStorage.clear()`. Data-layer tests assert counts (39 materials, 26 operators, 68 weapons, etc.) — if those assertions fail after a data re-port, **update the test** to match the new generated reality rather than reverting the port.

Recognition-merge tests live in `src/logic/recognition-merge.test.ts` (dedupe by id, max value, higher-confidence bbox wins, unknowns concatenate — same rules for inventory / operators / weapons).

## Workflow norms

- Commit after every logical unit (tasks in Plans A/B each end with a commit step). Messages use conventional prefixes `feat(scope): ...`, `docs: ...`, `design: ...`, etc.
- This is a solo local project — commits go direct to `main`. No PR flow.
- When changing the data model, re-read the relevant section of `2026-04-17-zmd-planner-design.md` before touching code; the spec was revised mid-project (v1 → v2) because upstream structure differed from initial assumptions, and that revision history matters.
