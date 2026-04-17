# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

本地复刻 [CaffuChin0/zmdgraph](https://github.com/CaffuChin0/zmdgraph) 的《明日方舟：终末地》养成规划器。v1（已完成）是 React + TS 前端；v2（Plan B，未实现）计划加 Python 后端做截图识别。

- **Spec**：`docs/superpowers/specs/2026-04-17-zmd-planner-design.md`
- **Plan A**（前端规划器，已交付 17/17）：`docs/superpowers/plans/2026-04-17-plan-a-planner-frontend.md`
- **Plan B**（后端 + 截图识别，未开始）：`docs/superpowers/plans/2026-04-17-plan-b-recognition-backend.md`

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

Icon/design principles live in `docs/superpowers/specs/...-design.md`. `reference/` is clone-space for upstream repos and is **gitignored** — never commit its contents.

## Architecture

### Data layer is source-of-truth, auto-generated

The four files under `frontend/src/data/` (`materials.ts`, `operators.ts`, `weapons.ts`, `database.ts`) are **auto-generated** from `reference/zmdgraph/js/data.js` and `weaponAdd.js` by `frontend/scripts/port-data.mjs`. Do not hand-edit them. To refresh after upstream changes:

```bash
cd reference/zmdgraph && git pull
cd ../../frontend
node scripts/port-data.mjs materials    # or: operators | weapons | database
```

`operators-helpers.ts` and `types.ts` are hand-written. Generated files carry a `// Auto-generated ... do not edit by hand.` banner.

Real counts baked into tests (exploration reports were wrong, actual numbers trust the generated data): **39 materials** (incl. 3 virtual EXP — `作战记录经验值`, `认知载体经验值`, `武器经验值` — never stored in stock, computed from EXP cards), **25 operators**, **66 weapons**, **481 DATABASE rows**.

### DATABASE is a flat cost table, not a typed cost tree

The core cost data is a flat array of rows `{干员, 升级项目, 现等级, 目标等级, ...sparse material fields}`. Material fields are sparse — only non-zero materials appear as keys on a row. `cost-calc.ts` (`calculateProjectMaterials`) implements the zmdgraph lookup algorithm:

1. Try **operator-specific exact match** (same 干员 + 项目 + 现等级 + 目标等级).
2. Fall back to **generic exact match** (`干员 === ""`).
3. Fall back to **per-level accumulation**: sum consecutive `lv → lv+1` rows across that range.

`calculateLevelMaterials` then walks the 5 level bands (`精0等级` 1→20, `精1等级` 20→40, `精2等级` 40→60, `精3等级` 60→80, `精4等级` 80→90), clips each to the query range, and delegates to `calculateProjectMaterials`. **Preserve this fallback order** — it matches upstream and its tests depend on it.

### Store / persistence

`src/store/app-store.ts` is the single Zustand store with `persist` middleware keyed at `zmd-planner-state` in `localStorage`. It holds `stock`, `ownedOperators`, `ownedWeapons`, `planRows`, `settings`. Tests reset via `useAppStore.setState(useAppStore.getInitialState())` — this API needs Zustand **5+** (installed).

Each operator has **10 growth dimensions** (`精英阶段`, `等级`, `装备适配`, `天赋`, `基建`, `信赖`, `技能1..4`). Each weapon has 2 (`破限阶段`, `等级`). The planner's `PlanRow` uses the `PlanProject` union = `UpgradeProject` (from `types.ts`) ∪ `'等级'` ∪ `'破限'`.

Note: `OperatorState` uses `信赖` (simplified field), but the upstream `UpgradeProject` enum spells it `能力值（信赖）` (with parens). The mapping between them lives in `components/planner/CostSummary.tsx` and `AddPlanRowDialog.tsx` — if you touch either, keep the mapping consistent in both.

### UI is dark-only, editorial Verge aesthetic

The app has **no light mode** (intentional — canvas is `#131313`). `AppShell.tsx` force-applies `html.dark`. Design tokens follow `/tmp/theverge-design.md` (The Verge brand) — Jelly Mint `#3cffd0` + Verge Ultraviolet `#5200ff` as hazard accents, Anton display / Hanken Grotesk UI / JetBrains Mono UPPERCASE labels, 1px borders instead of box-shadows, rounded pill radii (20/24/30/40px).

shadcn/ui components under `src/components/ui/` have been **rewritten** (not zinc defaults): `button.tsx` variants are Jelly Mint Pill (default), Dark Slate Pill (secondary), Outlined Mint 40px (outline), Ultraviolet Outlined (destructive). If adding new UI, match this vocabulary.

Button positioning convention across the app:
- Page headers: primary CTA top-right, same row as the Anton headline (`flex justify-between items-center`)
- Card rows: actions right-aligned (`ml-auto`)
- Dialog footers: destructive on left (`mr-auto`), confirm on right

### Tests

Co-located `*.test.ts` with the code they cover. Vitest + jsdom. Tests that touch the store call `useAppStore.setState(useAppStore.getInitialState())` in `beforeEach` and `localStorage.clear()`. Data-layer tests assert counts (39 materials, 25 operators, 66 weapons, etc.) — if those assertions fail after a data re-port, **update the test** to match the new generated reality rather than reverting the port.

## Workflow norms

- Commit after every logical unit (tasks in Plans A/B each end with a commit step). Messages use conventional prefixes `feat(scope): ...`, `docs: ...`, `design: ...`, etc.
- This is a solo local project — commits go direct to `main`. No PR flow.
- When changing the data model, re-read the relevant section of `2026-04-17-zmd-planner-design.md` before touching code; the spec was revised mid-project (v1 → v2) because upstream structure differed from initial assumptions, and that revision history matters.
