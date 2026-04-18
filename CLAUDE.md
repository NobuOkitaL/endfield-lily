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
- Tests: `pytest` (39 tests across pipeline modules + endpoint integration)
- One-command launch both: `./start.sh` at repo root

OCR backend is **rapidocr-onnxruntime** (Python 3.14 has no PaddlePaddle wheel; this is the documented fallback). Tiered OCR confidence: ≥0.8 trust, 0.5–0.8 trust only if parses cleanly, <0.5 unknown.

## Commands

All frontend commands run from `frontend/`:

```bash
pnpm dev              # Vite dev server → http://localhost:5173
pnpm build            # tsc -b && vite build
pnpm lint             # ESLint
pnpm test             # Vitest run (all tests, currently 67)
pnpm test:watch       # Vitest watch
pnpm test -- <file>   # Run one test file (e.g. pnpm test -- cost-calc)
```

TypeScript sanity check: `npx tsc --noEmit` (run from `frontend/`).

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

## Workflow norms

- Commit after every logical unit (tasks in Plans A/B each end with a commit step). Messages use conventional prefixes `feat(scope): ...`, `docs: ...`, `design: ...`, etc.
- This is a solo local project — commits go direct to `main`. No PR flow.
- When changing the data model, re-read the relevant section of `2026-04-17-zmd-planner-design.md` before touching code; the spec was revised mid-project (v1 → v2) because upstream structure differed from initial assumptions, and that revision history matters.
