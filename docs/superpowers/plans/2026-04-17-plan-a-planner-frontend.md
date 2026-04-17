# Plan A: 终末地规划器前端（从 zmdgraph 移植）实施计划（v2）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **v2 说明**：本 plan 从 v1 大改。v1 假设了通用"rarity + ascension"成长模型，和 zmdgraph 实际数据结构对不上。v2 按 zmdgraph 真实结构（38 种材料 + 697 行扁平升级表 + 独立的 8 个升级维度）重写。Tasks 1-3 已完成且不受影响，Tasks 4-17 是重写后的任务。

**Goal:** 交付一个能本地运行的《明日方舟：终末地》养成规划器前端，1:1 复刻 zmdgraph 的数据与计算逻辑，支持多维度（精英、等级、装备、天赋、基建、信赖、4 个技能）的精细规划和库存管理。

**Architecture:** 纯前端 SPA。React 18+ + Vite + TypeScript + Tailwind + shadcn/ui。Zustand + persist 中间件自动同步 localStorage。游戏数据通过端口脚本从 `reference/zmdgraph/js/data.js` 抽取生成 TS 文件，打进 bundle。

**Tech Stack:** 已安装：pnpm, Vite 8, React 19, TypeScript 6, Tailwind 3, shadcn/ui（button/card/input/label/table/tabs/dialog/sonner）, class-variance-authority, clsx, tailwind-merge, lucide-react, tailwindcss-animate。待装：zustand, react-router-dom, vitest, @testing-library/react, jsdom。

**Reference Repos (read-only):**
- `reference/zmdgraph/js/data.js`：所有数据（DATABASE、MATERIAL_ICONS、WEAPON_* 等）的上游
- `reference/zmdgraph/js/utils.js`：上游计算逻辑（`calculateMaterials`、`calculateLevelMaterials` 等）
- `reference/zmdgraph/js/stock.js`、`planner.js`：上游库存/规划页逻辑
- `reference/zmdgraph/js/weaponAdd.js`：`WEAPON_LIST`

**Spec:** `docs/superpowers/specs/2026-04-17-zmd-planner-design.md`

---

## Upstream 数据模型速查（给后续所有任务读）

### 数据结构（data.js / weaponAdd.js 里的顶层 const）

| 名称 | 行数/键数 | 结构 |
|------|-----------|------|
| `CHARACTER_LIST` | 25 | `string[]` 干员名 |
| `SKILL_MAPPING` | 25 | `{干员, 技能1, 技能2, 技能3, 技能4}[]` 技能显示名映射 |
| `EXCEPTIONS` | 1+ | `{干员, 排除项目}[]` 某干员不适用某升级项目 |
| `GENERAL_PROJECTS` | 10 | 升级项目名列表 |
| `DATABASE` | ~697 | `{干员, 升级项目, 现等级, 目标等级, ...稀疏材料字段}[]` |
| `WEAPON_EXP_VALUES` | 3 | `{武器检查单元: 200, 武器检查装置: 1000, 武器检查套组: 10000}` |
| `WEAPON_LEVEL_STAGES` | 89 | `{from, to, 武器经验值, 折金票}[]` |
| `WEAPON_BREAK_GENERAL` | 3 键 | `{1: {...}, 2: {...}, 3: {...}}` 通用破限 |
| `WEAPON_BREAK_4_BASE` | - | `{折金票: 90000, 重型强固模具: 30}` |
| `WEAPON_BREAK_4_SPECIAL` | 67 | `{[weaponName]: {材料: 数量}}` 第 4 级破限武器特殊材料 |
| `OPERATOR_AVATARS` | 25 | `{[name]: string}` 头像路径 |
| `WEAPON_AVATARS` | 67 | `{[name]: string}` |
| `MATERIAL_ICONS` | 38 | `{[name]: string}` **材料的权威集合** |
| `MATERIAL_COLUMNS` | 38 | `Object.keys(MATERIAL_ICONS)` 的运行时顺序 |
| `FARM_ITEMS` | 15 | `{name, output}[]` （v1 暂不使用） |
| `WEAPON_LIST` (weaponAdd.js) | 67 | `{name, star: 3|4|5|6}[]` |

### 材料完整清单（38 种）

- **货币**：`折金票`
- **EXP 虚拟物品**（不存库存，从卡片换算）：`作战记录经验值`, `认知载体经验值`, `武器经验值`
- **EXP 卡片**：`高级作战记录`(10000), `中级作战记录`(1000), `初级作战记录`(200), `高级认知载体`(10000), `初级认知载体`(1000), `武器检查单元`(200), `武器检查装置`(1000), `武器检查套组`(10000)
- **精英阶段**：`协议圆盘组`, `协议圆盘`, `轻红柱状菌`, `中红柱状菌`, `重红柱状菌`
- **技能/天赋/基建**：`协议棱柱组`, `协议棱柱`, `晶化多齿叶`, `纯晶多齿叶`, `至晶多齿叶`
- **高级材料（5 种）**：`三相纳米片`, `象限拟合液`, `快子遴捡晶格`, `D96钢样品四`, `超距辉映管`
- **武器破限**：`轻黯石`, `中黯石`, `重黯石`, `强固模具`, `重型强固模具`
- **Boss/稀有掉落**：`血菌`, `受蚀玉化叶`, `燎石`, `星门菌`, `岩天使叶`, `武陵石`, `存续的痕迹`

### 升级项目完整列表（10 种）

`精0等级`, `精1等级`, `精2等级`, `精3等级`, `精4等级`, `精英阶段`, `装备适配`, `能力值（信赖）`, `天赋`, `基建`, `技能1`, `技能2`, `技能3`, `技能4`

### 关键计算规则（见 utils.js）

1. **查找 DATABASE 行**：先按 `干员 === name` 找，找不到回退 `干员 === ""`。
2. **连续级求和**：若 (from, to) 没精确匹配行，尝试按每 1 级一行求和（如 skill 1→12 = 1→2 + 2→3 + ... + 11→12）。
3. **等级材料**（`calculateLevelMaterials`）：遍历 5 段（精0-精4），取重叠区间 `[max(from, bandStart), min(to, bandEnd)]`，逐级求和折金票和 EXP。
4. **EXP 卡片换算**（`convertRecordExpToMaterials` / `convertCognitionExpToMaterials`）：给定总 EXP 数字，贪心拆成 `高级作战记录 / 中级作战记录 / 初级作战记录`（或认知载体等价）。
5. **技能名映射**：`SKILL_MAPPING[op][技能N] === 显示名`；反过来：给定操作员 + 技能显示名，查出 `技能N` 的 generic key。

---

## Tasks 1-3（已完成，不重做）

- [x] **Task 1**：初始化 git、.gitignore、clone reference/zmdgraph 和 MaaEnd、首次 commit
- [x] **Task 2**：Vite 8 + React 19 + TS 6 scaffold，`@/` 别名
- [x] **Task 3**：Tailwind v3 + shadcn/ui（button/card/input/label/table/tabs/dialog/sonner）

---

## Task 4：移植材料列表 + EXP 换算表

**Files:**
- Create: `frontend/src/data/materials.ts`
- Create: `frontend/src/data/types.ts`
- Create: `frontend/src/data/materials.test.ts`
- Create: `frontend/scripts/port-data.mjs`（端口脚本，未来 sync 时复用）

**思路**：写个 Node ESM 脚本，用 `eval` 或 regex 把 `reference/zmdgraph/js/data.js` 里的关键 const 抽出来，`JSON.stringify` 后以 TS 文件写到 `src/data/`。脚本落盘到 `frontend/scripts/port-data.mjs` 长期保留。

- [ ] **Step 1：装测试依赖**

```bash
cd /Users/nobuokita/Desktop/ZMD/frontend
pnpm add -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

在 `package.json` 的 `scripts` 加：

```json
"test": "vitest run",
"test:watch": "vitest"
```

在 `vite.config.ts` 加 test 字段（保留现有 resolve/plugins）：

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: { environment: 'jsdom', globals: true },
});
```

- [ ] **Step 2：写端口脚本 `scripts/port-data.mjs`**

脚本要做：
1. 读 `reference/zmdgraph/js/data.js`（相对仓库根为 `../reference/zmdgraph/js/data.js`）
2. 用一个沙盒 `new Function(file + '; return {CHARACTER_LIST, SKILL_MAPPING, EXCEPTIONS, GENERAL_PROJECTS, DATABASE, WEAPON_EXP_VALUES, WEAPON_LEVEL_STAGES, WEAPON_BREAK_GENERAL, WEAPON_BREAK_4_BASE, WEAPON_BREAK_4_SPECIAL, OPERATOR_AVATARS, WEAPON_AVATARS, MATERIAL_ICONS};')()` 把所有 const 拉出来
3. 同样方式处理 `weaponAdd.js`（只要 `WEAPON_LIST`）
4. 把结果分别以 TS 文件写入 `src/data/*.ts`（见后续各 Task 指定的目标文件）
5. 每个 TS 文件顶部加 `// Auto-generated from reference/zmdgraph/js/data.js — do not edit by hand.`

**注意**：`data.js` 用的是 `const` 而不是 `export`，所以 `new Function` 结合返回对象字面量能拿到所有 const。不要用 `eval(file)`（污染作用域）。

**Step 2.1：先只让 Task 4 用到的部分落盘**

本任务只生成 `src/data/materials.ts`（其余 Task 5-7 调脚本再生成）。

脚本暴露 CLI 参数，比如 `node scripts/port-data.mjs materials` 只写材料部分。后续 Task 调 `node scripts/port-data.mjs operators`、`weapons`、`database`。

- [ ] **Step 3：运行端口脚本生成 materials.ts**

```bash
cd frontend
node scripts/port-data.mjs materials
```

生成内容要点：
```ts
// frontend/src/data/materials.ts
// Auto-generated from reference/zmdgraph/js/data.js — do not edit by hand.

export const MATERIAL_COLUMNS = [
  "折金票", "高级作战记录", /* ...全部 38 个名字 */
] as const;

export type MaterialName = typeof MATERIAL_COLUMNS[number];

export const MATERIAL_ICONS: Record<MaterialName, string> = {
  "折金票": "images/折金票.png",
  /* ... */
};

/** 这三种是 EXP 虚拟物品，从卡片数换算，不存库存。 */
export const VIRTUAL_EXP_MATERIALS = new Set<MaterialName>([
  "作战记录经验值",
  "认知载体经验值",
  "武器经验值",
]);

/** EXP 卡片 → EXP 值，用于换算 */
export const EXP_CARD_VALUES = {
  // 作战记录经验值卡片（前 80 级用）
  record: {
    "高级作战记录": 10000,
    "中级作战记录": 1000,
    "初级作战记录": 200,
  },
  // 认知载体经验值卡片（80+ 级用）
  cognition: {
    "高级认知载体": 10000,
    "初级认知载体": 1000,
  },
  // 武器经验值卡片
  weapon: {
    "武器检查套组": 10000,
    "武器检查装置": 1000,
    "武器检查单元": 200,
  },
} as const;

export type ExpType = keyof typeof EXP_CARD_VALUES;
```

- [ ] **Step 4：写 `src/data/types.ts`（公共类型）**

```ts
// frontend/src/data/types.ts
import type { MaterialName } from './materials';

export type OperatorName = string;
export type WeaponName = string;

/** 稀疏成本表，只含有非零材料 */
export type CostMap = Partial<Record<MaterialName, number>>;

/** 完整成本表，包含 EXP 虚拟材料的原始值（显示/聚合用） */
export type FullCostMap = Partial<Record<MaterialName, number>>;

export type UpgradeProject =
  | '精0等级' | '精1等级' | '精2等级' | '精3等级' | '精4等级'
  | '精英阶段' | '装备适配' | '能力值（信赖）' | '天赋' | '基建'
  | '技能1' | '技能2' | '技能3' | '技能4';
```

- [ ] **Step 5：测试 `src/data/materials.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { MATERIAL_COLUMNS, MATERIAL_ICONS, VIRTUAL_EXP_MATERIALS, EXP_CARD_VALUES } from './materials';

describe('materials data', () => {
  it('has exactly 38 materials', () => {
    expect(MATERIAL_COLUMNS.length).toBe(38);
  });

  it('MATERIAL_ICONS has icon for every column', () => {
    for (const m of MATERIAL_COLUMNS) {
      expect(MATERIAL_ICONS[m]).toBeTruthy();
    }
  });

  it('includes the three virtual EXP materials', () => {
    expect(VIRTUAL_EXP_MATERIALS.has('作战记录经验值')).toBe(true);
    expect(VIRTUAL_EXP_MATERIALS.has('认知载体经验值')).toBe(true);
    expect(VIRTUAL_EXP_MATERIALS.has('武器经验值')).toBe(true);
  });

  it('EXP card values match upstream', () => {
    expect(EXP_CARD_VALUES.record['高级作战记录']).toBe(10000);
    expect(EXP_CARD_VALUES.weapon['武器检查单元']).toBe(200);
  });

  it('has no duplicate columns', () => {
    expect(new Set(MATERIAL_COLUMNS).size).toBe(MATERIAL_COLUMNS.length);
  });
});
```

- [ ] **Step 6：跑测试**

```bash
cd frontend && pnpm test -- materials
# 预期全部 PASS
```

- [ ] **Step 7：提交**

```bash
cd /Users/nobuokita/Desktop/ZMD
git add frontend/
git commit -m "feat(data): port materials (38 items) and EXP conversion tables"
```

---

## Task 5：移植干员元数据

**Files:**
- Create: `frontend/src/data/operators.ts`
- Create: `frontend/src/data/operators.test.ts`
- Modify: `frontend/scripts/port-data.mjs`（加 operators case）

- [ ] **Step 1：扩展端口脚本，加 operators case**

`node scripts/port-data.mjs operators` 生成 `src/data/operators.ts`：

```ts
// frontend/src/data/operators.ts
// Auto-generated from reference/zmdgraph/js/data.js — do not edit by hand.

export const CHARACTER_LIST = [
  "洛茜", "汤汤", /* ... 25 个 */
] as const;

export const SKILL_MAPPING = [
  { 干员: "洛茜", 技能1: "普攻:沸腾狼血", 技能2: "战技:血红之影", 技能3: "连携:燎影时刻", 技能4: "大招:“利爪”奇袭" },
  /* ... 全部 25 条 */
];

export const EXCEPTIONS = [
  { 干员: "管理员", 排除项目: "基建" },
];

export const OPERATOR_AVATARS: Record<string, string> = {
  "洛茜": "images/...",
  /* ... */
};
```

**Step 1.1：加一个手写 helper（不在自动生成里）**

```ts
// frontend/src/data/operators.ts（底部，手写区）

import type { OperatorName } from './types';

/**
 * 把技能显示名（如"战技:血红之影"）映射回 generic key "技能2"。
 * 找不到返回 null。
 */
export function mapSkillDisplayToGeneric(operator: OperatorName, displayName: string): '技能1' | '技能2' | '技能3' | '技能4' | null {
  const row = SKILL_MAPPING.find((r) => r.干员 === operator);
  if (!row) return null;
  for (const key of ['技能1', '技能2', '技能3', '技能4'] as const) {
    if (row[key] === displayName) return key;
  }
  return null;
}

/** 给定干员和升级项目，判断是否被 EXCEPTIONS 排除。 */
export function isProjectExcluded(operator: OperatorName, project: string): boolean {
  return EXCEPTIONS.some((e) => e.干员 === operator && e.排除项目 === project);
}
```

自动生成部分和手写 helper 之间加一条清晰注释分隔线。**端口脚本不能覆盖手写 helper**：脚本应把手写代码读出来追加回去，或者把手写 helper 放到单独文件 `src/data/operators-helpers.ts`。更简单的方案：**把手写 helper 放到 `operators-helpers.ts`，`operators.ts` 只放自动生成**。选后者。

所以实际文件结构：
- `frontend/src/data/operators.ts`（自动生成，端口脚本可覆盖）
- `frontend/src/data/operators-helpers.ts`（手写，脚本永不动）

- [ ] **Step 2：运行端口脚本**

```bash
cd frontend && node scripts/port-data.mjs operators
```

- [ ] **Step 3：测试 `src/data/operators.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { CHARACTER_LIST, SKILL_MAPPING, EXCEPTIONS, OPERATOR_AVATARS } from './operators';
import { mapSkillDisplayToGeneric, isProjectExcluded } from './operators-helpers';

describe('operators data', () => {
  it('has 25 characters', () => {
    expect(CHARACTER_LIST.length).toBe(25);
  });

  it('SKILL_MAPPING covers every character', () => {
    for (const name of CHARACTER_LIST) {
      expect(SKILL_MAPPING.find((r) => r.干员 === name)).toBeDefined();
    }
  });

  it('OPERATOR_AVATARS covers every character', () => {
    for (const name of CHARACTER_LIST) {
      expect(OPERATOR_AVATARS[name]).toBeTruthy();
    }
  });

  it('mapSkillDisplayToGeneric resolves display names', () => {
    // 从实际数据选一条
    const any = SKILL_MAPPING[0];
    expect(mapSkillDisplayToGeneric(any.干员, any.技能1)).toBe('技能1');
    expect(mapSkillDisplayToGeneric(any.干员, '不存在的技能')).toBeNull();
  });

  it('isProjectExcluded matches known exception', () => {
    expect(isProjectExcluded('管理员', '基建')).toBe(true);
    expect(isProjectExcluded('洛茜', '基建')).toBe(false);
  });
});
```

- [ ] **Step 4：跑测试 + 提交**

```bash
cd frontend && pnpm test -- operators
cd ..
git add frontend/
git commit -m "feat(data): port operators metadata and skill mapping"
```

---

## Task 6：移植武器元数据和武器成本表

**Files:**
- Create: `frontend/src/data/weapons.ts`（自动生成）
- Create: `frontend/src/data/weapons.test.ts`
- Modify: `frontend/scripts/port-data.mjs`

- [ ] **Step 1：扩展端口脚本，加 weapons case**

```bash
cd frontend && node scripts/port-data.mjs weapons
```

生成内容：

```ts
// frontend/src/data/weapons.ts
// Auto-generated — do not edit by hand.

export type WeaponStar = 3 | 4 | 5 | 6;

export const WEAPON_LIST = [
  { name: "晨光之刃", star: 5 }, /* ... 67 个 */
] as const;

export const WEAPON_AVATARS: Record<string, string> = { /* ... */ };

export const WEAPON_LEVEL_STAGES = [
  { from: 1, to: 2, 武器经验值: 100, 折金票: 50 },
  /* ... 89 行 */
] as const;

export const WEAPON_BREAK_GENERAL = {
  1: { 折金票: 2200, 强固模具: 5, 轻黯石: 3 },
  2: { 折金票: 8500, 强固模具: 18, 中黯石: 5 },
  3: { 折金票: 25000, 重型强固模具: 20, 重黯石: 5 },
} as const;

export const WEAPON_BREAK_4_BASE = { 折金票: 90000, 重型强固模具: 30 } as const;

export const WEAPON_BREAK_4_SPECIAL: Record<string, Partial<Record<string, number>>> = {
  "晨光之刃": { 三相纳米片: 16, 燎石: 8 },
  /* ... 每个武器一行 */
};
```

- [ ] **Step 2：测试 `src/data/weapons.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { WEAPON_LIST, WEAPON_LEVEL_STAGES, WEAPON_BREAK_GENERAL, WEAPON_BREAK_4_BASE, WEAPON_BREAK_4_SPECIAL, WEAPON_AVATARS } from './weapons';

describe('weapons data', () => {
  it('has 67 weapons', () => {
    expect(WEAPON_LIST.length).toBe(67);
  });

  it('every weapon has star 3-6', () => {
    for (const w of WEAPON_LIST) {
      expect([3, 4, 5, 6]).toContain(w.star);
    }
  });

  it('WEAPON_LEVEL_STAGES covers 1→90', () => {
    const firstFrom = WEAPON_LEVEL_STAGES[0].from;
    const lastTo = WEAPON_LEVEL_STAGES[WEAPON_LEVEL_STAGES.length - 1].to;
    expect(firstFrom).toBe(1);
    expect(lastTo).toBe(90);
    expect(WEAPON_LEVEL_STAGES.length).toBe(89);
  });

  it('WEAPON_BREAK_GENERAL has three stages', () => {
    expect(Object.keys(WEAPON_BREAK_GENERAL)).toEqual(['1', '2', '3']);
  });

  it('WEAPON_BREAK_4_SPECIAL has entry for every weapon', () => {
    for (const w of WEAPON_LIST) {
      expect(WEAPON_BREAK_4_SPECIAL[w.name]).toBeDefined();
    }
  });

  it('WEAPON_AVATARS covers every weapon', () => {
    for (const w of WEAPON_LIST) {
      expect(WEAPON_AVATARS[w.name]).toBeTruthy();
    }
  });
});
```

- [ ] **Step 3：跑测试 + 提交**

```bash
cd frontend && pnpm test -- weapons
cd ..
git add frontend/
git commit -m "feat(data): port weapons metadata and cost tables"
```

---

## Task 7：移植 DATABASE（697 行升级成本表）

**Files:**
- Create: `frontend/src/data/database.ts`（自动生成）
- Create: `frontend/src/data/database.test.ts`
- Modify: `frontend/scripts/port-data.mjs`

- [ ] **Step 1：扩展端口脚本，加 database case**

生成：

```ts
// frontend/src/data/database.ts
// Auto-generated — do not edit by hand. ~697 rows.

import type { UpgradeProject } from './types';

export interface UpgradeCostRow {
  干员: string; // "" = generic
  升级项目: UpgradeProject;
  现等级: number;
  目标等级: number;
  // 以下全部可选，稀疏存在
  折金票?: number;
  作战记录经验值?: number;
  认知载体经验值?: number;
  [mat: string]: number | string | undefined;
}

export const DATABASE: UpgradeCostRow[] = [
  { 干员: "", 升级项目: "精0等级", 现等级: 1, 目标等级: 2, 折金票: 0, 作战记录经验值: 20 },
  /* ... 697 条 */
];
```

脚本在写盘前按 `(升级项目, 干员, 现等级)` 顺序排一下，让 diff 稳定。

```bash
cd frontend && node scripts/port-data.mjs database
```

- [ ] **Step 2：测试 `src/data/database.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { DATABASE } from './database';
import { MATERIAL_COLUMNS } from './materials';

describe('DATABASE', () => {
  it('has at least 600 rows', () => {
    expect(DATABASE.length).toBeGreaterThanOrEqual(600);
  });

  it('every row has basic structure', () => {
    for (const row of DATABASE) {
      expect(typeof row.干员).toBe('string');
      expect(typeof row.升级项目).toBe('string');
      expect(typeof row.现等级).toBe('number');
      expect(typeof row.目标等级).toBe('number');
      expect(row.目标等级).toBeGreaterThan(row.现等级);
    }
  });

  it('every material field key is in MATERIAL_COLUMNS', () => {
    const allowed = new Set<string>([...MATERIAL_COLUMNS, '干员', '升级项目', '现等级', '目标等级']);
    for (const row of DATABASE) {
      for (const key of Object.keys(row)) {
        expect(allowed.has(key)).toBe(true);
      }
    }
  });

  it('includes rows for all 精0-精4等级', () => {
    for (const band of ['精0等级', '精1等级', '精2等级', '精3等级', '精4等级'] as const) {
      expect(DATABASE.some((r) => r.升级项目 === band)).toBe(true);
    }
  });

  it('has 精英阶段 stage 3→4 entries for every character', () => {
    const { CHARACTER_LIST } = require('./operators');
    for (const name of CHARACTER_LIST) {
      expect(
        DATABASE.some(
          (r) => r.干员 === name && r.升级项目 === '精英阶段' && r.现等级 === 3 && r.目标等级 === 4,
        ),
      ).toBe(true);
    }
  });
});
```

- [ ] **Step 3：跑测试 + 提交**

```bash
cd frontend && pnpm test -- database
cd ..
git add frontend/
git commit -m "feat(data): port 697-row DATABASE upgrade cost table"
```

---

## Task 8：成本计算逻辑（TDD）

**Files:**
- Create: `frontend/src/logic/cost-calc.ts`
- Create: `frontend/src/logic/cost-calc.test.ts`
- Create: `frontend/src/logic/exp-conversion.ts`
- Create: `frontend/src/logic/exp-conversion.test.ts`

**参考上游**：`reference/zmdgraph/js/utils.js` 里的 `calculateMaterials`、`calculateLevelMaterials`、`convertRecordExpToMaterials`、`convertCognitionExpToMaterials`。**先读懂再实现**。

- [ ] **Step 1：先写 exp-conversion 的失败测试**

```ts
// frontend/src/logic/exp-conversion.test.ts
import { describe, expect, it } from 'vitest';
import { convertExpToCards, sumExpCards } from './exp-conversion';

describe('convertExpToCards (record/作战记录)', () => {
  it('returns all zeros for zero exp', () => {
    expect(convertExpToCards(0, 'record')).toEqual({});
  });

  it('greedy fills highest tier first', () => {
    // 21000 EXP = 2 张高级 (20000) + 1 张中级 (1000)
    expect(convertExpToCards(21000, 'record')).toEqual({
      '高级作战记录': 2,
      '中级作战记录': 1,
    });
  });

  it('rounds up the lowest tier when not divisible', () => {
    // 250 EXP = 2 张初级 (400)，向上取整到满足 ≥ 250
    expect(convertExpToCards(250, 'record')['初级作战记录']).toBe(2);
  });
});

describe('sumExpCards (inverse)', () => {
  it('sums card counts to EXP', () => {
    expect(sumExpCards({ '高级作战记录': 1, '中级作战记录': 2 }, 'record')).toBe(12000);
  });
});
```

- [ ] **Step 2：运行确认失败**

```bash
cd frontend && pnpm test -- exp-conversion
# FAIL（模块不存在）
```

- [ ] **Step 3：实现 `exp-conversion.ts`**

```ts
// frontend/src/logic/exp-conversion.ts
import { EXP_CARD_VALUES, type ExpType, type MaterialName } from '@/data/materials';

/**
 * 把一个 EXP 总数贪心拆成 EXP 卡片数。
 * 从高到低分配，低级卡片向上取整以保证覆盖总量。
 */
export function convertExpToCards(exp: number, type: ExpType): Partial<Record<MaterialName, number>> {
  if (exp <= 0) return {};
  const table = EXP_CARD_VALUES[type];
  const entries = Object.entries(table).sort((a, b) => b[1] - a[1]); // 高→低
  const out: Partial<Record<MaterialName, number>> = {};
  let remaining = exp;
  for (let i = 0; i < entries.length - 1; i++) {
    const [name, value] = entries[i];
    const n = Math.floor(remaining / value);
    if (n > 0) {
      out[name as MaterialName] = n;
      remaining -= n * value;
    }
  }
  // 最低档向上取整
  if (remaining > 0) {
    const [lowestName, lowestValue] = entries[entries.length - 1];
    out[lowestName as MaterialName] = Math.ceil(remaining / lowestValue);
  }
  return out;
}

export function sumExpCards(cards: Partial<Record<MaterialName, number>>, type: ExpType): number {
  const table: Record<string, number> = EXP_CARD_VALUES[type];
  let sum = 0;
  for (const [name, count] of Object.entries(cards)) {
    const v = table[name];
    if (v && count) sum += v * count;
  }
  return sum;
}
```

- [ ] **Step 4：跑测试通过**

```bash
pnpm test -- exp-conversion
# PASS
```

- [ ] **Step 5：写 cost-calc 失败测试**

```ts
// frontend/src/logic/cost-calc.test.ts
import { describe, expect, it } from 'vitest';
import {
  calculateProjectMaterials,
  calculateLevelMaterials,
  calculateWeaponLevelCost,
  calculateWeaponBreakCost,
  aggregateCosts,
  emptyCost,
} from './cost-calc';

describe('calculateProjectMaterials (精英阶段 generic)', () => {
  it('returns generic row cost for stage 0→1', () => {
    const cost = calculateProjectMaterials('洛茜', '精英阶段', 0, 1);
    expect(cost).toBeTruthy();
    expect(cost!.折金票).toBe(1600);
    expect(cost!.协议圆盘).toBe(8);
  });

  it('returns operator-specific cost for 精英阶段 stage 3→4', () => {
    const cost = calculateProjectMaterials('洛茜', '精英阶段', 3, 4);
    expect(cost).toBeTruthy();
    expect(cost!.折金票).toBe(100000);
  });
});

describe('calculateLevelMaterials', () => {
  it('returns zero for identical current and target', () => {
    expect(calculateLevelMaterials('洛茜', 30, 30)).toEqual({ 折金票: 0 });
  });

  it('sums within a single band', () => {
    const cost = calculateLevelMaterials('洛茜', 1, 3);
    // 1→2 (20 exp, 0 coin) + 2→3 (30 exp, 0 coin) = 50 exp, 0 coin
    expect(cost.作战记录经验值).toBe(50);
    expect(cost.折金票).toBe(0);
  });

  it('spans bands (e.g., 18 → 22 crosses 精0→精1)', () => {
    const cost = calculateLevelMaterials('洛茜', 18, 22);
    expect(cost.折金票).toBeGreaterThan(0);
    expect(cost.作战记录经验值).toBeGreaterThan(0);
  });
});

describe('calculateWeaponLevelCost', () => {
  it('sums 武器经验值 and 折金票 for a range', () => {
    const cost = calculateWeaponLevelCost(1, 3);
    expect(cost.武器经验值).toBeGreaterThan(0);
    expect(cost.折金票).toBeGreaterThan(0);
  });
});

describe('calculateWeaponBreakCost', () => {
  it('applies generic for break 1-3', () => {
    expect(calculateWeaponBreakCost('晨光之刃', 1)).toMatchObject({ 折金票: 2200, 强固模具: 5, 轻黯石: 3 });
  });

  it('applies base + special for break 4', () => {
    const cost = calculateWeaponBreakCost('晨光之刃', 4);
    expect(cost.折金票).toBe(90000);
    expect(cost.重型强固模具).toBe(30);
    // 特殊材料也应该在（具体值依赖数据）
  });
});

describe('aggregateCosts', () => {
  it('sums multiple cost maps', () => {
    expect(
      aggregateCosts([
        { 折金票: 100, 协议棱柱: 5 },
        { 折金票: 50, 协议棱柱: 3, 协议圆盘: 2 },
      ]),
    ).toEqual({ 折金票: 150, 协议棱柱: 8, 协议圆盘: 2 });
  });

  it('returns empty for empty input', () => {
    expect(aggregateCosts([])).toEqual({});
  });
});
```

注意测试里的具体数字 (1600, 8, 20, 30, 50 等) 都必须与真实 DATABASE 数据一致。先跑一次测试看失败原因确认是"函数不存在"而不是"数字不对"。

- [ ] **Step 6：运行确认失败**

```bash
pnpm test -- cost-calc
# FAIL（模块不存在）
```

- [ ] **Step 7：实现 `cost-calc.ts`**

```ts
// frontend/src/logic/cost-calc.ts
import { DATABASE, type UpgradeCostRow } from '@/data/database';
import { WEAPON_LEVEL_STAGES, WEAPON_BREAK_GENERAL, WEAPON_BREAK_4_BASE, WEAPON_BREAK_4_SPECIAL } from '@/data/weapons';
import { MATERIAL_COLUMNS, type MaterialName } from '@/data/materials';
import type { CostMap, UpgradeProject, OperatorName, WeaponName } from '@/data/types';

export function emptyCost(): CostMap {
  return {};
}

function addInto(target: Record<string, number>, key: string, val: number) {
  if (!val) return;
  target[key] = (target[key] ?? 0) + val;
}

export function addCost(a: CostMap, b: CostMap): CostMap {
  const out: Record<string, number> = { ...a } as any;
  for (const [k, v] of Object.entries(b)) {
    if (typeof v === 'number' && v !== 0) {
      out[k] = (out[k] ?? 0) + v;
    }
  }
  return out as CostMap;
}

export function aggregateCosts(costs: CostMap[]): CostMap {
  return costs.reduce((acc, c) => addCost(acc, c), emptyCost());
}

/** 从 DATABASE 行抽取所有"材料字段"（不含干员/升级项目/现等级/目标等级），返回 CostMap。 */
function extractRowCost(row: UpgradeCostRow): CostMap {
  const out: Record<string, number> = {};
  for (const col of MATERIAL_COLUMNS) {
    const v = row[col];
    if (typeof v === 'number' && v !== 0) out[col] = v;
  }
  return out as CostMap;
}

/**
 * 查某干员某升级项目从 from 到 to 的消耗。
 * 先试 operator-specific 精确匹配；再试 generic 精确匹配；再按连续单级求和（operator-specific 优先）。
 * 找不到返回 null。
 */
export function calculateProjectMaterials(
  operator: OperatorName,
  project: UpgradeProject,
  from: number,
  to: number,
): CostMap | null {
  if (from === to) return emptyCost();

  // 1) operator-specific exact
  const opSpec = DATABASE.find(
    (r) => r.干员 === operator && r.升级项目 === project && r.现等级 === from && r.目标等级 === to,
  );
  if (opSpec) return extractRowCost(opSpec);

  // 2) generic exact
  const generic = DATABASE.find(
    (r) => r.干员 === '' && r.升级项目 === project && r.现等级 === from && r.目标等级 === to,
  );
  if (generic) return extractRowCost(generic);

  // 3) sum consecutive single-level rows
  let acc: CostMap = emptyCost();
  for (let lv = from; lv < to; lv++) {
    const row =
      DATABASE.find(
        (r) => r.干员 === operator && r.升级项目 === project && r.现等级 === lv && r.目标等级 === lv + 1,
      ) ??
      DATABASE.find(
        (r) => r.干员 === '' && r.升级项目 === project && r.现等级 === lv && r.目标等级 === lv + 1,
      );
    if (!row) return null;
    acc = addCost(acc, extractRowCost(row));
  }
  return acc;
}

/**
 * 等级 from → to 的消耗。遍历 5 个精英段，取重叠区间累加。
 * 不涉及精英阶段本身（那是单独项目）。
 */
const LEVEL_BANDS: { project: UpgradeProject; start: number; end: number }[] = [
  { project: '精0等级', start: 1, end: 20 },
  { project: '精1等级', start: 20, end: 40 },
  { project: '精2等级', start: 40, end: 60 },
  { project: '精3等级', start: 60, end: 80 },
  { project: '精4等级', start: 80, end: 90 },
];

export function calculateLevelMaterials(operator: OperatorName, from: number, to: number): CostMap {
  if (from >= to) return { 折金票: 0 } as CostMap;
  let acc: CostMap = { 折金票: 0 };
  for (const band of LEVEL_BANDS) {
    const lo = Math.max(from, band.start);
    const hi = Math.min(to, band.end);
    if (lo >= hi) continue;
    const segment = calculateProjectMaterials(operator, band.project, lo, hi);
    if (segment) acc = addCost(acc, segment);
  }
  return acc;
}

export function calculateWeaponLevelCost(from: number, to: number): CostMap {
  if (from >= to) return {};
  let acc: CostMap = {};
  for (const stage of WEAPON_LEVEL_STAGES) {
    if (stage.from >= from && stage.to <= to) {
      acc = addCost(acc, { 武器经验值: stage.武器经验值, 折金票: stage.折金票 });
    }
  }
  return acc;
}

export function calculateWeaponBreakCost(weaponName: WeaponName, stage: 1 | 2 | 3 | 4): CostMap {
  if (stage <= 3) {
    return { ...(WEAPON_BREAK_GENERAL as any)[stage] };
  }
  // stage 4: base + special
  const special = WEAPON_BREAK_4_SPECIAL[weaponName] ?? {};
  return addCost(WEAPON_BREAK_4_BASE as CostMap, special as CostMap);
}
```

- [ ] **Step 8：跑测试**

```bash
pnpm test -- cost-calc
# 预期全部 PASS
```

**若有测试失败**：通常是测试里的常量与真实数据不一致。**不要改实现去迁就测试**；先打开 `reference/zmdgraph/js/data.js` 核对真实值，然后改测试。

- [ ] **Step 9：提交**

```bash
cd ..
git add frontend/
git commit -m "feat(logic): cost calculation with DATABASE lookup and band aggregation"
```

---

## Task 9：库存逻辑 + EXP 虚拟换算（TDD）

**Files:**
- Create: `frontend/src/logic/stock.ts`
- Create: `frontend/src/logic/stock.test.ts`

- [ ] **Step 1：失败测试**

```ts
// frontend/src/logic/stock.test.ts
import { describe, expect, it } from 'vitest';
import { mergeStock, diffStock, deductStock, isAffordable, computeVirtualExp, type Stock } from './stock';

describe('mergeStock', () => {
  it('adds counts', () => {
    const merged = mergeStock({ 折金票: 100 }, { 折金票: 50, 协议棱柱: 5 }, { mode: 'add' });
    expect(merged).toEqual({ 折金票: 150, 协议棱柱: 5 });
  });
  it('replaces counts', () => {
    expect(mergeStock({ 折金票: 100, 协议棱柱: 3 }, { 折金票: 50 }, { mode: 'replace' }))
      .toEqual({ 折金票: 50, 协议棱柱: 3 });
  });
});

describe('diffStock', () => {
  it('returns missing amounts', () => {
    expect(diffStock({ 折金票: 100 }, { 折金票: 150, 协议棱柱: 3 }))
      .toEqual({ 折金票: 50, 协议棱柱: 3 });
  });
  it('returns empty when fully covered', () => {
    expect(diffStock({ 折金票: 200 }, { 折金票: 150 })).toEqual({});
  });
});

describe('isAffordable', () => {
  it('true when diff empty', () => {
    expect(isAffordable({ 折金票: 100 }, { 折金票: 50 })).toBe(true);
  });
  it('false otherwise', () => {
    expect(isAffordable({ 折金票: 50 }, { 折金票: 100 })).toBe(false);
  });
});

describe('deductStock', () => {
  it('subtracts and clamps at zero', () => {
    expect(deductStock({ 折金票: 100, 协议棱柱: 5 }, { 折金票: 30, 协议棱柱: 5 }))
      .toEqual({ 折金票: 70 });
  });
});

describe('computeVirtualExp', () => {
  it('sums EXP cards to record EXP', () => {
    const stock: Stock = { 高级作战记录: 2, 中级作战记录: 3 };
    expect(computeVirtualExp(stock, 'record')).toBe(2 * 10000 + 3 * 1000);
  });
  it('returns 0 when no relevant cards', () => {
    expect(computeVirtualExp({ 折金票: 100 }, 'record')).toBe(0);
  });
});
```

- [ ] **Step 2：跑确认失败 → 实现**

```bash
cd frontend && pnpm test -- stock
# FAIL
```

```ts
// frontend/src/logic/stock.ts
import type { MaterialName } from '@/data/materials';
import { sumExpCards } from './exp-conversion';
import type { ExpType } from '@/data/materials';

export type Stock = Partial<Record<MaterialName, number>>;

export type MergeMode = 'add' | 'replace';

export function mergeStock(base: Stock, patch: Stock, opts: { mode: MergeMode }): Stock {
  const out: Stock = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (typeof v !== 'number') continue;
    if (opts.mode === 'add') {
      out[k as MaterialName] = (out[k as MaterialName] ?? 0) + v;
    } else {
      out[k as MaterialName] = v;
    }
  }
  return out;
}

export function diffStock(have: Stock, need: Stock): Stock {
  const out: Stock = {};
  for (const [k, v] of Object.entries(need)) {
    if (typeof v !== 'number') continue;
    const missing = v - (have[k as MaterialName] ?? 0);
    if (missing > 0) out[k as MaterialName] = missing;
  }
  return out;
}

export function isAffordable(have: Stock, need: Stock): boolean {
  return Object.keys(diffStock(have, need)).length === 0;
}

export function deductStock(have: Stock, spent: Stock): Stock {
  const out: Stock = {};
  for (const [k, v] of Object.entries(have)) {
    if (typeof v !== 'number') continue;
    const remain = v - (spent[k as MaterialName] ?? 0);
    if (remain > 0) out[k as MaterialName] = remain;
  }
  return out;
}

export function computeVirtualExp(stock: Stock, type: ExpType): number {
  return sumExpCards(stock, type);
}
```

- [ ] **Step 3：跑通过 + 提交**

```bash
pnpm test -- stock
cd ..
git add frontend/
git commit -m "feat(logic): stock merge/diff/deduct + virtual EXP computation"
```

---

## Task 10：Zustand store

**Files:**
- Create: `frontend/src/store/app-store.ts`
- Create: `frontend/src/store/app-store.test.ts`

`planRows` 按上游设计：**运行时即每次 state 变化就重算每行的 materials**。存储时可以存 materials（跟上游一致），也可以不存（重算）。保守起见存进去（和上游行为一致 + 支持离线查看）。

- [ ] **Step 1：装 zustand**

```bash
cd frontend && pnpm add zustand
```

- [ ] **Step 2：失败测试**

```ts
// frontend/src/store/app-store.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from './app-store';

describe('app store', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState(useAppStore.getInitialState());
  });

  it('initial state is empty', () => {
    const s = useAppStore.getState();
    expect(s.stock).toEqual({});
    expect(s.ownedOperators).toEqual({});
    expect(s.ownedWeapons).toEqual({});
    expect(s.planRows).toEqual([]);
    expect(s.settings.darkMode).toBe(false);
  });

  it('sets stock by material name', () => {
    useAppStore.getState().setStock('折金票', 100);
    expect(useAppStore.getState().stock['折金票']).toBe(100);
  });

  it('sets owned operator status (multi-field)', () => {
    useAppStore.getState().setOwnedOperator('洛茜', {
      精英阶段: 2, 等级: 45, 装备适配: 1, 天赋: 2, 基建: 1, 信赖: 2,
      技能1: 7, 技能2: 7, 技能3: 5, 技能4: 7,
    });
    expect(useAppStore.getState().ownedOperators['洛茜']?.等级).toBe(45);
  });

  it('adds plan row and removes by id', () => {
    useAppStore.getState().addPlanRow({
      id: 'p1', 干员: '洛茜', 项目: '精英阶段', 现等级: 0, 目标等级: 1,
      materials: { 折金票: 1600 }, hidden: false,
    });
    expect(useAppStore.getState().planRows).toHaveLength(1);
    useAppStore.getState().removePlanRow('p1');
    expect(useAppStore.getState().planRows).toHaveLength(0);
  });

  it('toggles dark mode', () => {
    const before = useAppStore.getState().settings.darkMode;
    useAppStore.getState().toggleDarkMode();
    expect(useAppStore.getState().settings.darkMode).toBe(!before);
  });

  it('exports and imports snapshot', () => {
    useAppStore.getState().setStock('折金票', 100);
    const json = useAppStore.getState().exportSnapshot();
    useAppStore.setState(useAppStore.getInitialState());
    useAppStore.getState().importSnapshot(json);
    expect(useAppStore.getState().stock['折金票']).toBe(100);
  });
});
```

- [ ] **Step 3：实现 `app-store.ts`**

```ts
// frontend/src/store/app-store.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Stock } from '@/logic/stock';
import type { MaterialName } from '@/data/materials';
import type { UpgradeProject, CostMap } from '@/data/types';

export interface OperatorState {
  精英阶段: number; // 0-4
  等级: number;     // 1-90
  装备适配: number; // 0-3
  天赋: number;     // 0-4
  基建: number;     // 0-4
  信赖: number;     // 0-4
  技能1: number;    // 1-12
  技能2: number;
  技能3: number;
  技能4: number;
}

export interface WeaponState {
  破限阶段: number; // 0-4
  等级: number;     // 1-90
}

export interface PlanRow {
  id: string;
  干员: string;             // operator or weapon name
  项目: UpgradeProject | '等级' | '破限';
  现等级: number;
  目标等级: number;
  materials: CostMap;
  hidden: boolean;
}

interface Settings { darkMode: boolean }

interface AppState {
  stock: Stock;
  ownedOperators: Record<string, OperatorState>;
  ownedWeapons: Record<string, WeaponState>;
  planRows: PlanRow[];
  settings: Settings;

  setStock: (name: MaterialName, count: number) => void;
  replaceStock: (s: Stock) => void;

  setOwnedOperator: (name: string, state: OperatorState) => void;
  removeOwnedOperator: (name: string) => void;

  setOwnedWeapon: (name: string, state: WeaponState) => void;
  removeOwnedWeapon: (name: string) => void;

  addPlanRow: (row: PlanRow) => void;
  updatePlanRow: (id: string, patch: Partial<PlanRow>) => void;
  removePlanRow: (id: string) => void;

  toggleDarkMode: () => void;

  exportSnapshot: () => string;
  importSnapshot: (json: string) => void;
}

const INITIAL: Pick<AppState, 'stock' | 'ownedOperators' | 'ownedWeapons' | 'planRows' | 'settings'> = {
  stock: {},
  ownedOperators: {},
  ownedWeapons: {},
  planRows: [],
  settings: { darkMode: false },
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...INITIAL,

      setStock: (name, count) => set((s) => ({ stock: { ...s.stock, [name]: count } })),
      replaceStock: (newStock) => set({ stock: newStock }),

      setOwnedOperator: (name, state) => set((s) => ({ ownedOperators: { ...s.ownedOperators, [name]: state } })),
      removeOwnedOperator: (name) => set((s) => {
        const { [name]: _, ...rest } = s.ownedOperators; return { ownedOperators: rest };
      }),

      setOwnedWeapon: (name, state) => set((s) => ({ ownedWeapons: { ...s.ownedWeapons, [name]: state } })),
      removeOwnedWeapon: (name) => set((s) => {
        const { [name]: _, ...rest } = s.ownedWeapons; return { ownedWeapons: rest };
      }),

      addPlanRow: (row) => set((s) => ({ planRows: [...s.planRows, row] })),
      updatePlanRow: (id, patch) => set((s) => ({
        planRows: s.planRows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      })),
      removePlanRow: (id) => set((s) => ({ planRows: s.planRows.filter((r) => r.id !== id) })),

      toggleDarkMode: () => set((s) => ({ settings: { ...s.settings, darkMode: !s.settings.darkMode } })),

      exportSnapshot: () => JSON.stringify(
        {
          stock: get().stock,
          ownedOperators: get().ownedOperators,
          ownedWeapons: get().ownedWeapons,
          planRows: get().planRows,
          settings: get().settings,
        },
        null,
        2,
      ),
      importSnapshot: (json) => {
        const parsed = JSON.parse(json);
        set({
          stock: parsed.stock ?? {},
          ownedOperators: parsed.ownedOperators ?? {},
          ownedWeapons: parsed.ownedWeapons ?? {},
          planRows: parsed.planRows ?? [],
          settings: parsed.settings ?? { darkMode: false },
        });
      },
    }),
    { name: 'zmd-planner-state', version: 1 },
  ),
);
```

- [ ] **Step 4：跑测试通过 + 提交**

```bash
pnpm test -- app-store
cd ..
git add frontend/
git commit -m "feat(store): zustand store with stock/owned/plans/settings + persist"
```

---

## Task 11：App 外壳 + 路由 + 导航栏

**Files:**
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/components/layout/AppShell.tsx`
- Create: `frontend/src/components/layout/Nav.tsx`
- Create: `frontend/src/pages/HomePage.tsx`, `StockPage.tsx`, `OperatorsPage.tsx`, `WeaponsPage.tsx`, `PlannerPage.tsx`, `SettingsPage.tsx`（占位）

（与 v1 相同。）

- [ ] **Step 1：装 React Router**

```bash
cd frontend && pnpm add react-router-dom
```

- [ ] **Step 2：写 6 个占位页**

例：

```tsx
// frontend/src/pages/HomePage.tsx
export default function HomePage() {
  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold">首页</h2>
      <p className="text-muted-foreground mt-2">从左侧导航进入各模块。</p>
    </div>
  );
}
```

照此建：`StockPage`、`OperatorsPage`、`WeaponsPage`、`PlannerPage`、`SettingsPage`。

- [ ] **Step 3：写 `Nav.tsx`**

```tsx
// frontend/src/components/layout/Nav.tsx
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

const LINKS = [
  { to: '/', label: '首页' },
  { to: '/planner', label: '规划' },
  { to: '/stock', label: '库存' },
  { to: '/operators', label: '干员' },
  { to: '/weapons', label: '武器' },
  { to: '/settings', label: '设置' },
];

export function Nav() {
  return (
    <nav className="flex flex-col gap-1 p-4 border-r h-full w-48 shrink-0">
      <div className="text-lg font-semibold mb-4">ZMD</div>
      {LINKS.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          end={l.to === '/'}
          className={({ isActive }) =>
            cn('px-3 py-2 rounded-md text-sm hover:bg-accent', isActive && 'bg-accent font-medium')
          }
        >
          {l.label}
        </NavLink>
      ))}
    </nav>
  );
}
```

- [ ] **Step 4：写 `AppShell.tsx`**

```tsx
// frontend/src/components/layout/AppShell.tsx
import { Outlet } from 'react-router-dom';
import { useEffect } from 'react';
import { Nav } from './Nav';
import { useAppStore } from '@/store/app-store';

export function AppShell() {
  const darkMode = useAppStore((s) => s.settings.darkMode);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  return (
    <div className="flex h-screen">
      <Nav />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 5：替换 `App.tsx` 为路由根**

```tsx
// frontend/src/App.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import HomePage from '@/pages/HomePage';
import StockPage from '@/pages/StockPage';
import OperatorsPage from '@/pages/OperatorsPage';
import WeaponsPage from '@/pages/WeaponsPage';
import PlannerPage from '@/pages/PlannerPage';
import SettingsPage from '@/pages/SettingsPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="/planner" element={<PlannerPage />} />
          <Route path="/stock" element={<StockPage />} />
          <Route path="/operators" element={<OperatorsPage />} />
          <Route path="/weapons" element={<WeaponsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
```

- [ ] **Step 6：人工验证 + 提交**

```bash
pnpm dev # 访问每个页面确认能进
cd ..
git add frontend/
git commit -m "feat(frontend): routing and app shell with 6 pages"
```

---

## Task 12：库存页（35 个材料卡片 + EXP 虚拟计算）

**Files:**
- Rewrite: `frontend/src/pages/StockPage.tsx`
- Create: `frontend/src/components/stock/StockGrid.tsx`

- [ ] **Step 1：实现 `StockGrid.tsx`**

```tsx
// frontend/src/components/stock/StockGrid.tsx
import { useState } from 'react';
import { MATERIAL_COLUMNS, VIRTUAL_EXP_MATERIALS, type MaterialName } from '@/data/materials';
import { useAppStore } from '@/store/app-store';
import { computeVirtualExp } from '@/logic/stock';
import { Input } from '@/components/ui/input';

const EXP_TYPE_FOR_VIRTUAL: Record<string, 'record' | 'cognition' | 'weapon'> = {
  '作战记录经验值': 'record',
  '认知载体经验值': 'cognition',
  '武器经验值': 'weapon',
};

export function StockGrid() {
  const stock = useAppStore((s) => s.stock);
  const setStock = useAppStore((s) => s.setStock);
  const [filter, setFilter] = useState('');

  const rows = MATERIAL_COLUMNS.filter((n) => (filter ? n.includes(filter) : true));

  return (
    <div className="space-y-3">
      <Input placeholder="搜索材料..." value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-xs" />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {rows.map((name) => {
          if (VIRTUAL_EXP_MATERIALS.has(name)) {
            const val = computeVirtualExp(stock, EXP_TYPE_FOR_VIRTUAL[name]);
            return (
              <div key={name} className="border rounded-md p-3 bg-muted/30">
                <div className="text-sm font-medium">{name}</div>
                <div className="text-xs text-muted-foreground mt-1">计算值</div>
                <div className="text-lg font-mono mt-1">{val.toLocaleString()}</div>
              </div>
            );
          }
          const current = stock[name as MaterialName] ?? 0;
          return (
            <div key={name} className="border rounded-md p-3">
              <div className="text-sm font-medium">{name}</div>
              <Input
                type="number"
                min={0}
                value={current}
                onChange={(e) => setStock(name as MaterialName, Math.max(0, Number(e.target.value) || 0))}
                className="mt-2"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2：替换 `StockPage.tsx`**

```tsx
// frontend/src/pages/StockPage.tsx
import { StockGrid } from '@/components/stock/StockGrid';

export default function StockPage() {
  return (
    <div className="p-6 space-y-4">
      <h2 className="text-2xl font-semibold">库存</h2>
      <p className="text-sm text-muted-foreground">输入持有量。EXP 项为计算值，由对应卡片数量自动求出。</p>
      <StockGrid />
    </div>
  );
}
```

- [ ] **Step 3：验证 + 提交**

```bash
cd frontend && pnpm dev # 访问 /stock 测试
cd ..
git add frontend/
git commit -m "feat(stock): 35-material grid with virtual EXP display"
```

---

## Task 13：干员页

**Files:**
- Rewrite: `frontend/src/pages/OperatorsPage.tsx`
- Create: `frontend/src/components/operators/OperatorGrid.tsx`
- Create: `frontend/src/components/operators/OperatorEditDialog.tsx`

- [ ] **Step 1：`OperatorEditDialog.tsx`**

```tsx
// frontend/src/components/operators/OperatorEditDialog.tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useEffect, useState } from 'react';
import type { OperatorState } from '@/store/app-store';

const DEFAULT_STATE: OperatorState = {
  精英阶段: 0, 等级: 1, 装备适配: 0, 天赋: 0, 基建: 0, 信赖: 0,
  技能1: 1, 技能2: 1, 技能3: 1, 技能4: 1,
};

const FIELDS: { key: keyof OperatorState; label: string; min: number; max: number }[] = [
  { key: '精英阶段', label: '精英阶段', min: 0, max: 4 },
  { key: '等级', label: '等级', min: 1, max: 90 },
  { key: '装备适配', label: '装备适配', min: 0, max: 3 },
  { key: '天赋', label: '天赋', min: 0, max: 4 },
  { key: '基建', label: '基建', min: 0, max: 4 },
  { key: '信赖', label: '信赖', min: 0, max: 4 },
  { key: '技能1', label: '技能1', min: 1, max: 12 },
  { key: '技能2', label: '技能2', min: 1, max: 12 },
  { key: '技能3', label: '技能3', min: 1, max: 12 },
  { key: '技能4', label: '技能4', min: 1, max: 12 },
];

export function OperatorEditDialog({
  operatorName, open, onOpenChange, initial, onSave, onRemove,
}: {
  operatorName: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: OperatorState;
  onSave: (state: OperatorState) => void;
  onRemove?: () => void;
}) {
  const [state, setState] = useState<OperatorState>(initial ?? DEFAULT_STATE);
  useEffect(() => { setState(initial ?? DEFAULT_STATE); }, [initial, open]);
  if (!operatorName) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{operatorName}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <Label className="text-xs">{f.label}</Label>
              <Input
                type="number" min={f.min} max={f.max}
                value={state[f.key]}
                onChange={(e) => {
                  const v = Math.max(f.min, Math.min(f.max, Number(e.target.value) || f.min));
                  setState((s) => ({ ...s, [f.key]: v }));
                }}
              />
            </div>
          ))}
        </div>
        <DialogFooter className="gap-2">
          {onRemove && <Button variant="destructive" onClick={onRemove}>移除</Button>}
          <Button onClick={() => onSave(state)}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2：`OperatorGrid.tsx`**

```tsx
// frontend/src/components/operators/OperatorGrid.tsx
import { useState } from 'react';
import { CHARACTER_LIST } from '@/data/operators';
import { useAppStore } from '@/store/app-store';
import { OperatorEditDialog } from './OperatorEditDialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function OperatorGrid() {
  const owned = useAppStore((s) => s.ownedOperators);
  const setOwned = useAppStore((s) => s.setOwnedOperator);
  const removeOwned = useAppStore((s) => s.removeOwnedOperator);
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<string | null>(null);

  const names = CHARACTER_LIST.filter((n) => (filter ? n.includes(filter) : true));

  return (
    <div className="space-y-3">
      <Input placeholder="搜索干员..." value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-xs" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {names.map((n) => {
          const has = owned[n];
          return (
            <div key={n} className={`border rounded-md p-3 flex items-center justify-between ${has ? 'bg-accent/40' : ''}`}>
              <div>
                <div className="font-medium">{n}</div>
                <div className="text-xs text-muted-foreground">
                  {has ? `精${has.精英阶段} Lv.${has.等级} 装${has.装备适配} 天${has.天赋} 建${has.基建} 信${has.信赖}` : '未持有'}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setEditing(n)}>{has ? '编辑' : '添加'}</Button>
            </div>
          );
        })}
      </div>

      <OperatorEditDialog
        operatorName={editing}
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        initial={editing ? owned[editing] : undefined}
        onSave={(state) => { if (editing) { setOwned(editing, state); setEditing(null); } }}
        onRemove={editing && owned[editing] ? () => { removeOwned(editing); setEditing(null); } : undefined}
      />
    </div>
  );
}
```

- [ ] **Step 3：改 `OperatorsPage.tsx`**

```tsx
import { OperatorGrid } from '@/components/operators/OperatorGrid';

export default function OperatorsPage() {
  return (
    <div className="p-6 space-y-4">
      <h2 className="text-2xl font-semibold">干员</h2>
      <p className="text-sm text-muted-foreground">记录你持有的每个干员的当前状态（10 个维度）。</p>
      <OperatorGrid />
    </div>
  );
}
```

- [ ] **Step 4：验证 + 提交**

```bash
cd frontend && pnpm dev # 测试 /operators
cd ..
git add frontend/
git commit -m "feat(operators): operator grid with 10-dimension edit dialog"
```

---

## Task 14：武器页

**Files:**
- Rewrite: `frontend/src/pages/WeaponsPage.tsx`
- Create: `frontend/src/components/weapons/WeaponGrid.tsx`
- Create: `frontend/src/components/weapons/WeaponEditDialog.tsx`

`WeaponEditDialog` 只有两个字段：`破限阶段` (0-4) 和 `等级` (1-90)。

`WeaponGrid` 按 `star` 分组显示（6★/5★/4★/3★ 四个区块）。

- [ ] **Step 1：实现 `WeaponEditDialog.tsx`**（复制 OperatorEditDialog 模式，字段改为 2 个）

```tsx
// frontend/src/components/weapons/WeaponEditDialog.tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useEffect, useState } from 'react';
import type { WeaponState } from '@/store/app-store';

const DEFAULT: WeaponState = { 破限阶段: 0, 等级: 1 };

export function WeaponEditDialog({
  weaponName, open, onOpenChange, initial, onSave, onRemove,
}: {
  weaponName: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: WeaponState;
  onSave: (state: WeaponState) => void;
  onRemove?: () => void;
}) {
  const [state, setState] = useState<WeaponState>(initial ?? DEFAULT);
  useEffect(() => { setState(initial ?? DEFAULT); }, [initial, open]);
  if (!weaponName) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{weaponName}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>破限阶段</Label>
            <Input type="number" min={0} max={4} value={state.破限阶段} onChange={(e) => setState((s) => ({ ...s, 破限阶段: Math.max(0, Math.min(4, Number(e.target.value) || 0)) }))} />
          </div>
          <div>
            <Label>等级</Label>
            <Input type="number" min={1} max={90} value={state.等级} onChange={(e) => setState((s) => ({ ...s, 等级: Math.max(1, Math.min(90, Number(e.target.value) || 1)) }))} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          {onRemove && <Button variant="destructive" onClick={onRemove}>移除</Button>}
          <Button onClick={() => onSave(state)}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2：实现 `WeaponGrid.tsx`**

```tsx
// frontend/src/components/weapons/WeaponGrid.tsx
import { useState } from 'react';
import { WEAPON_LIST } from '@/data/weapons';
import { useAppStore } from '@/store/app-store';
import { WeaponEditDialog } from './WeaponEditDialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function WeaponGrid() {
  const owned = useAppStore((s) => s.ownedWeapons);
  const setOwned = useAppStore((s) => s.setOwnedWeapon);
  const removeOwned = useAppStore((s) => s.removeOwnedWeapon);
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<string | null>(null);

  const groups: Array<{ star: 3 | 4 | 5 | 6; items: typeof WEAPON_LIST }> = [
    { star: 6, items: WEAPON_LIST.filter((w) => w.star === 6 && (!filter || w.name.includes(filter))) },
    { star: 5, items: WEAPON_LIST.filter((w) => w.star === 5 && (!filter || w.name.includes(filter))) },
    { star: 4, items: WEAPON_LIST.filter((w) => w.star === 4 && (!filter || w.name.includes(filter))) },
    { star: 3, items: WEAPON_LIST.filter((w) => w.star === 3 && (!filter || w.name.includes(filter))) },
  ];

  return (
    <div className="space-y-4">
      <Input placeholder="搜索武器..." value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-xs" />
      {groups.map((g) => g.items.length > 0 && (
        <section key={g.star} className="space-y-2">
          <h3 className="font-semibold">{g.star}★</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {g.items.map((w) => {
              const has = owned[w.name];
              return (
                <div key={w.name} className={`border rounded-md p-3 flex items-center justify-between ${has ? 'bg-accent/40' : ''}`}>
                  <div>
                    <div className="font-medium">{w.name}</div>
                    <div className="text-xs text-muted-foreground">{has ? `破${has.破限阶段} Lv.${has.等级}` : '未持有'}</div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setEditing(w.name)}>{has ? '编辑' : '添加'}</Button>
                </div>
              );
            })}
          </div>
        </section>
      ))}
      <WeaponEditDialog
        weaponName={editing}
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        initial={editing ? owned[editing] : undefined}
        onSave={(state) => { if (editing) { setOwned(editing, state); setEditing(null); } }}
        onRemove={editing && owned[editing] ? () => { removeOwned(editing); setEditing(null); } : undefined}
      />
    </div>
  );
}
```

- [ ] **Step 3：改 `WeaponsPage.tsx`**

```tsx
import { WeaponGrid } from '@/components/weapons/WeaponGrid';

export default function WeaponsPage() {
  return (
    <div className="p-6 space-y-4">
      <h2 className="text-2xl font-semibold">武器</h2>
      <p className="text-sm text-muted-foreground">记录你持有的武器和当前破限/等级。</p>
      <WeaponGrid />
    </div>
  );
}
```

- [ ] **Step 4：验证 + 提交**

```bash
cd frontend && pnpm dev # 测试 /weapons
cd ..
git add frontend/
git commit -m "feat(weapons): weapon grid grouped by star + edit dialog"
```

---

## Task 15：规划页

**Files:**
- Rewrite: `frontend/src/pages/PlannerPage.tsx`
- Create: `frontend/src/components/planner/PlanRowList.tsx`
- Create: `frontend/src/components/planner/AddPlanRowDialog.tsx`
- Create: `frontend/src/components/planner/CostSummary.tsx`
- Create: `frontend/src/logic/plan-aggregator.ts`
- Create: `frontend/src/logic/plan-aggregator.test.ts`

计算：对每条 PlanRow，根据 `(干员, 项目, 现等级, 目标等级)` 调 `calculateProjectMaterials` / `calculateLevelMaterials` / `calculateWeaponLevelCost` / `calculateWeaponBreakCost`；聚合得到总需求。

- [ ] **Step 1：TDD plan-aggregator**

```ts
// frontend/src/logic/plan-aggregator.test.ts
import { describe, expect, it, beforeEach } from 'vitest';
import { useAppStore } from '@/store/app-store';
import { computeAllPlanCost, computeRowCost } from './plan-aggregator';

describe('computeRowCost', () => {
  it('operator 等级 range → non-empty cost', () => {
    const c = computeRowCost({
      id: 'x', 干员: '洛茜', 项目: '等级', 现等级: 1, 目标等级: 3,
      materials: {}, hidden: false,
    });
    expect(Object.keys(c).length).toBeGreaterThan(0);
  });

  it('operator 精英阶段 0→1 → matches DATABASE generic', () => {
    const c = computeRowCost({
      id: 'x', 干员: '洛茜', 项目: '精英阶段', 现等级: 0, 目标等级: 1,
      materials: {}, hidden: false,
    });
    expect(c.折金票).toBe(1600);
  });

  it('weapon 破限 stage 1 → generic break cost', () => {
    const c = computeRowCost({
      id: 'x', 干员: '晨光之刃', 项目: '破限', 现等级: 0, 目标等级: 1,
      materials: {}, hidden: false,
    });
    expect(c.折金票).toBe(2200);
  });
});

describe('computeAllPlanCost', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState(useAppStore.getInitialState());
  });

  it('returns empty when no rows', () => {
    expect(computeAllPlanCost()).toEqual({});
  });

  it('aggregates and skips hidden', () => {
    useAppStore.getState().addPlanRow({
      id: 'a', 干员: '洛茜', 项目: '精英阶段', 现等级: 0, 目标等级: 1,
      materials: {}, hidden: false,
    });
    useAppStore.getState().addPlanRow({
      id: 'b', 干员: '洛茜', 项目: '精英阶段', 现等级: 0, 目标等级: 1,
      materials: {}, hidden: true,
    });
    expect(computeAllPlanCost().折金票).toBe(1600);
  });
});
```

- [ ] **Step 2：实现 `plan-aggregator.ts`**

```ts
// frontend/src/logic/plan-aggregator.ts
import { useAppStore, type PlanRow } from '@/store/app-store';
import {
  calculateProjectMaterials,
  calculateLevelMaterials,
  calculateWeaponLevelCost,
  calculateWeaponBreakCost,
  aggregateCosts,
} from './cost-calc';
import { WEAPON_LIST } from '@/data/weapons';
import { CHARACTER_LIST } from '@/data/operators';
import type { CostMap, UpgradeProject } from '@/data/types';

function isWeapon(name: string): boolean {
  return WEAPON_LIST.some((w) => w.name === name);
}

function isOperator(name: string): boolean {
  return (CHARACTER_LIST as readonly string[]).includes(name);
}

export function computeRowCost(row: PlanRow): CostMap {
  if (isOperator(row.干员)) {
    if (row.项目 === '等级') return calculateLevelMaterials(row.干员, row.现等级, row.目标等级);
    const c = calculateProjectMaterials(row.干员, row.项目 as UpgradeProject, row.现等级, row.目标等级);
    return c ?? {};
  }
  if (isWeapon(row.干员)) {
    if (row.项目 === '等级') return calculateWeaponLevelCost(row.现等级, row.目标等级);
    if (row.项目 === '破限') {
      // 跨多级破限：从 (现等级+1) 到 目标等级 每级累加
      let acc: CostMap = {};
      for (let stage = row.现等级 + 1; stage <= row.目标等级; stage++) {
        acc = { ...acc };
        const stageCost = calculateWeaponBreakCost(row.干员, stage as 1 | 2 | 3 | 4);
        for (const [k, v] of Object.entries(stageCost)) {
          if (typeof v === 'number') acc[k as keyof CostMap] = ((acc as any)[k] ?? 0) + v;
        }
      }
      return acc;
    }
  }
  return {};
}

export function computeAllPlanCost(): CostMap {
  const rows = useAppStore.getState().planRows.filter((r) => !r.hidden);
  return aggregateCosts(rows.map(computeRowCost));
}
```

- [ ] **Step 3：测试通过**

```bash
pnpm test -- plan-aggregator
```

- [ ] **Step 4：实现 `AddPlanRowDialog.tsx`**

```tsx
// frontend/src/components/planner/AddPlanRowDialog.tsx
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CHARACTER_LIST } from '@/data/operators';
import { WEAPON_LIST } from '@/data/weapons';
import { useAppStore } from '@/store/app-store';
import { computeRowCost } from '@/logic/plan-aggregator';

const OP_PROJECTS = ['等级', '精英阶段', '装备适配', '天赋', '基建', '能力值（信赖）', '技能1', '技能2', '技能3', '技能4'];
const WP_PROJECTS = ['等级', '破限'];

export function AddPlanRowDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const addRow = useAppStore((s) => s.addPlanRow);
  const ownedOps = useAppStore((s) => s.ownedOperators);
  const ownedWps = useAppStore((s) => s.ownedWeapons);

  const [target, setTarget] = useState('');
  const [project, setProject] = useState('');
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(1);

  const isWeapon = WEAPON_LIST.some((w) => w.name === target);
  const isOp = (CHARACTER_LIST as readonly string[]).includes(target);
  const projects = isWeapon ? WP_PROJECTS : OP_PROJECTS;

  useEffect(() => {
    if (!target) return;
    if (!projects.includes(project)) setProject(projects[0]);
    // 根据已持有状态初始化 from
    if (isOp && ownedOps[target]) {
      const st = ownedOps[target];
      if (project === '等级') setFrom(st.等级);
      else if (project === '精英阶段') setFrom(st.精英阶段);
      else if (project === '装备适配') setFrom(st.装备适配);
      else if (project === '天赋') setFrom(st.天赋);
      else if (project === '基建') setFrom(st.基建);
      else if (project === '能力值（信赖）') setFrom(st.信赖);
      else if (project.startsWith('技能')) setFrom((st as any)[project]);
    } else if (isWeapon && ownedWps[target]) {
      const st = ownedWps[target];
      if (project === '等级') setFrom(st.等级);
      else if (project === '破限') setFrom(st.破限阶段);
    }
  }, [target, project, isOp, isWeapon, ownedOps, ownedWps]);

  function handleSave() {
    if (!target || !project || from >= to) return;
    const row = {
      id: crypto.randomUUID(),
      干员: target,
      项目: project as any,
      现等级: from,
      目标等级: to,
      materials: {},
      hidden: false,
    };
    row.materials = computeRowCost(row);
    addRow(row);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>新增规划</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>干员 / 武器</Label>
            <select className="w-full border rounded-md px-2 py-1.5 bg-background" value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">-- 选择 --</option>
              <optgroup label="干员">
                {CHARACTER_LIST.map((n) => <option key={n} value={n}>{n}</option>)}
              </optgroup>
              <optgroup label="武器">
                {WEAPON_LIST.map((w) => <option key={w.name} value={w.name}>{w.name}</option>)}
              </optgroup>
            </select>
          </div>
          <div>
            <Label>升级项目</Label>
            <select className="w-full border rounded-md px-2 py-1.5 bg-background" value={project} onChange={(e) => setProject(e.target.value)}>
              {projects.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>当前</Label>
              <Input type="number" value={from} onChange={(e) => setFrom(Number(e.target.value) || 0)} />
            </div>
            <div>
              <Label>目标</Label>
              <Input type="number" value={to} onChange={(e) => setTo(Number(e.target.value) || 0)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={!target || from >= to}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5：实现 `PlanRowList.tsx`**

```tsx
// frontend/src/components/planner/PlanRowList.tsx
import { useAppStore } from '@/store/app-store';
import { Button } from '@/components/ui/button';

export function PlanRowList() {
  const rows = useAppStore((s) => s.planRows);
  const remove = useAppStore((s) => s.removePlanRow);
  const update = useAppStore((s) => s.updatePlanRow);

  if (rows.length === 0) return <div className="text-sm text-muted-foreground">暂无规划。点击"新增规划"添加。</div>;

  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.id} className={`border rounded-md p-3 flex items-center justify-between ${r.hidden ? 'opacity-50' : ''}`}>
          <div>
            <div className="font-medium">{r.干员} · {r.项目}</div>
            <div className="text-xs text-muted-foreground">{r.现等级} → {r.目标等级}</div>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => update(r.id, { hidden: !r.hidden })}>{r.hidden ? '启用' : '禁用'}</Button>
            <Button variant="ghost" size="sm" onClick={() => remove(r.id)}>移除</Button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 6：实现 `CostSummary.tsx`**

```tsx
// frontend/src/components/planner/CostSummary.tsx
import { useAppStore } from '@/store/app-store';
import { computeAllPlanCost } from '@/logic/plan-aggregator';
import { diffStock, deductStock } from '@/logic/stock';
import { Button } from '@/components/ui/button';
import { MATERIAL_COLUMNS, VIRTUAL_EXP_MATERIALS, type MaterialName } from '@/data/materials';

export function CostSummary() {
  const stock = useAppStore((s) => s.stock);
  const planRows = useAppStore((s) => s.planRows);
  const replaceStock = useAppStore((s) => s.replaceStock);
  const setOwnedOp = useAppStore((s) => s.setOwnedOperator);
  const setOwnedWp = useAppStore((s) => s.setOwnedWeapon);
  const removeRow = useAppStore((s) => s.removePlanRow);
  const ownedOps = useAppStore((s) => s.ownedOperators);
  const ownedWps = useAppStore((s) => s.ownedWeapons);

  const cost = computeAllPlanCost();
  const missing = diffStock(stock, cost);
  const hasPlans = planRows.some((r) => !r.hidden);

  function completeAll() {
    // 扣库存（EXP 虚拟不动）
    const realCost = { ...cost };
    for (const ex of VIRTUAL_EXP_MATERIALS) delete (realCost as any)[ex];
    replaceStock(deductStock(stock, realCost));
    // 回写 owned
    for (const r of planRows) {
      if (r.hidden) continue;
      // 操作员
      if (ownedOps[r.干员] && r.项目 !== '破限') {
        const st = { ...ownedOps[r.干员] };
        if (r.项目 === '等级') st.等级 = r.目标等级;
        else if (r.项目 === '精英阶段') st.精英阶段 = r.目标等级;
        else if (r.项目 === '装备适配') st.装备适配 = r.目标等级;
        else if (r.项目 === '天赋') st.天赋 = r.目标等级;
        else if (r.项目 === '基建') st.基建 = r.目标等级;
        else if (r.项目 === '能力值（信赖）') st.信赖 = r.目标等级;
        else if (r.项目.startsWith('技能')) (st as any)[r.项目] = r.目标等级;
        setOwnedOp(r.干员, st);
      }
      // 武器
      if (ownedWps[r.干员]) {
        const st = { ...ownedWps[r.干员] };
        if (r.项目 === '等级') st.等级 = r.目标等级;
        else if (r.项目 === '破限') st.破限阶段 = r.目标等级;
        setOwnedWp(r.干员, st);
      }
      removeRow(r.id);
    }
  }

  return (
    <div className="border rounded-md p-4 space-y-3">
      <h3 className="font-semibold">消耗汇总</h3>
      <div className="grid grid-cols-2 text-sm gap-y-1">
        {MATERIAL_COLUMNS.map((m) => {
          const need = cost[m as MaterialName];
          if (!need) return null;
          const have = stock[m as MaterialName] ?? 0;
          const short = have < need && !VIRTUAL_EXP_MATERIALS.has(m);
          return (
            <div key={m} className="contents">
              <div>{m}</div>
              <div className={`text-right font-mono ${short ? 'text-destructive' : ''}`}>
                {VIRTUAL_EXP_MATERIALS.has(m) ? `${need.toLocaleString()}` : `${have} / ${need}${short ? ` (缺 ${need - have})` : ''}`}
              </div>
            </div>
          );
        })}
      </div>
      {Object.keys(missing).length === 0 && hasPlans && (
        <Button onClick={completeAll}>完成全部规划（扣减库存）</Button>
      )}
    </div>
  );
}
```

- [ ] **Step 7：写 `PlannerPage.tsx`**

```tsx
// frontend/src/pages/PlannerPage.tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { PlanRowList } from '@/components/planner/PlanRowList';
import { AddPlanRowDialog } from '@/components/planner/AddPlanRowDialog';
import { CostSummary } from '@/components/planner/CostSummary';

export default function PlannerPage() {
  const [addOpen, setAddOpen] = useState(false);
  return (
    <div className="p-6 grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">规划</h2>
          <Button onClick={() => setAddOpen(true)}>新增规划</Button>
        </div>
        <PlanRowList />
      </div>
      <CostSummary />
      <AddPlanRowDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
```

- [ ] **Step 8：验证 + 提交**

```bash
cd frontend && pnpm dev
# 全流程测试：加干员 → 加规划行 → 看汇总 → /stock 塞够料 → 完成
cd ..
git add frontend/
git commit -m "feat(planner): planner page with aggregation and completion"
```

---

## Task 16：设置页

**Files:** Rewrite `frontend/src/pages/SettingsPage.tsx`

（与 v1 相同。）

```tsx
// frontend/src/pages/SettingsPage.tsx
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/store/app-store';

export default function SettingsPage() {
  const darkMode = useAppStore((s) => s.settings.darkMode);
  const toggleDarkMode = useAppStore((s) => s.toggleDarkMode);
  const exportSnapshot = useAppStore((s) => s.exportSnapshot);
  const importSnapshot = useAppStore((s) => s.importSnapshot);
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);

  function handleExport() {
    const json = exportSnapshot();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zmd-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg('已导出');
  }
  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { try { importSnapshot(r.result as string); setMsg('已导入'); } catch { setMsg('导入失败：JSON 无效'); } };
    r.readAsText(f);
    e.target.value = '';
  }

  return (
    <div className="p-6 space-y-6 max-w-xl">
      <h2 className="text-2xl font-semibold">设置</h2>
      <section className="space-y-2">
        <h3 className="font-semibold">外观</h3>
        <Button variant="outline" onClick={toggleDarkMode}>{darkMode ? '切换为浅色' : '切换为深色'}</Button>
      </section>
      <section className="space-y-2">
        <h3 className="font-semibold">备份</h3>
        <div className="flex gap-2">
          <Button onClick={handleExport}>导出 JSON</Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()}>导入 JSON</Button>
          <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={handleImport} />
        </div>
        {msg && <div className="text-sm text-muted-foreground">{msg}</div>}
      </section>
    </div>
  );
}
```

- [ ] **验证 + 提交**

```bash
cd frontend && pnpm dev
cd ..
git add frontend/
git commit -m "feat(settings): dark mode + JSON backup/restore"
```

---

## Task 17：README

```md
# ZMD — 终末地养成规划器（本地版）

本地复刻 [CaffuChin0/zmdgraph](https://github.com/CaffuChin0/zmdgraph) 的《明日方舟：终末地》养成规划器，React + TypeScript 重写，数据完全 1:1 移植。

v1：纯前端规划器。v2 计划加 Python 后端做截图自动识别。

## 启动

前置：Node.js 20+, pnpm。

```bash
cd frontend
pnpm install
pnpm dev
# http://localhost:5173
```

## 功能

- 库存管理（35 种材料，EXP 自动从卡片换算）
- 干员管理（25 个，10 个升级维度）
- 武器管理（67 个，按星级分组）
- 规划器（增删规划、聚合消耗、缺料提示、一键完成）
- 备份/恢复（JSON）
- 深色模式

## 数据更新

游戏数据由 `scripts/port-data.mjs` 从 `reference/zmdgraph/` 自动抽取。要同步上游更新：

```bash
cd reference/zmdgraph && git pull
cd ../../frontend && node scripts/port-data.mjs all
```

会重新生成 `src/data/*.ts`，人工审 diff 后提交。

## 测试

```bash
cd frontend && pnpm test
```

## 致谢

- 游戏数据 / 计算逻辑：[CaffuChin0/zmdgraph](https://github.com/CaffuChin0/zmdgraph)
- 后续图标素材（v2）：[MaaEnd/MaaEnd](https://github.com/MaaEnd/MaaEnd)
```

- [ ] **提交**

```bash
git add README.md
git commit -m "docs: v2 README covering ported planner features"
```

---

## Self-Review Notes (v2)

| 上游结构 | 覆盖于 |
|---------|-------|
| MATERIAL_ICONS / _COLUMNS + EXP 换算 | Task 4 |
| CHARACTER_LIST / SKILL_MAPPING / EXCEPTIONS | Task 5 |
| WEAPON_LIST / 武器成本表 | Task 6 |
| DATABASE (697 行) | Task 7 |
| calculateMaterials / calculateLevelMaterials | Task 8 |
| Stock + EXP 虚拟材料 | Task 9 |
| 用户持久数据（含多维 owned state） | Task 10 |
| UI 层 | Task 11-16 |
| 数据同步文档 | Task 17 |

**Placeholder 扫描**：每个 data port 任务都明确指向 `reference/zmdgraph/js/data.js` 并通过 `scripts/port-data.mjs` 自动生成，不需要手抄数据。Task 4-7 的脚本扩展是增量实现。

**类型一致**：`MaterialName`, `CostMap`, `UpgradeProject`, `OperatorState`, `WeaponState`, `PlanRow` 跨多个文件使用一致。

**已知 gap（刻意不覆盖）**：
- `FARM_ITEMS`（产出规划）— 暂不用，v1 不覆盖
- zmdgraph 的"forward/backward compensation"（材料降级/升级替代）— 复杂度高，v1 不做，v2 或 backlog
- 技能显示名→技能N 映射在 UI 里暂时不用（目前选择器直接用"技能1/2/3/4"）— `mapSkillDisplayToGeneric` helper 已建，未来加截图识别时会用到
