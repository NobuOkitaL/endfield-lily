# Plan A: 终末地规划器前端（从 zmdgraph 移植）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付一个能本地运行的《明日方舟：终末地》养成规划器前端，功能与 zmdgraph 对齐（干员/武器培养表、库存、规划、备份/导入、深色模式），用 React + TS + Tailwind + shadcn/ui 重写，数据存 localStorage。完成后已经可以当规划器使用，无需后端。

**Architecture:** 纯前端 SPA。React 18 + Vite 管理构建。Zustand + persist 中间件自动同步 localStorage。游戏数据（材料/干员/武器/消耗表）打进 bundle。shadcn/ui 提供组件。规划计算和库存合并都写成纯函数，便于单测。

**Tech Stack:** Node.js 20+, pnpm, Vite 5, React 18, TypeScript 5, Tailwind CSS 3, shadcn/ui, Zustand 4, React Router 6, Vitest.

**Reference Repos (read-only):**
- `CaffuChin0/zmdgraph`：照搬 `js/data.js` 的数据结构和 `js/planner.js`、`js/stock.js` 的计算逻辑。
- 不复用原项目的 HTML/CSS/UI 代码。

**Spec:** `docs/superpowers/specs/2026-04-17-zmd-planner-design.md`

---

## Task 1：初始化仓库和参考代码

**Files:**
- Create: `.gitignore`
- Create: `README.md`（占位）
- Create: `reference/.gitignore`（忽略所有参考克隆）

- [ ] **Step 1: 在 ZMD/ 初始化 git**

```bash
cd /Users/nobuokita/Desktop/ZMD
git init
git branch -M main
```

- [ ] **Step 2: 写根 .gitignore**

```bash
cat > .gitignore <<'EOF'
# Dependencies
node_modules/
**/.venv/
__pycache__/
*.pyc

# Build outputs
frontend/dist/
frontend/.vite/

# Reference repos (cloned read-only, never committed)
reference/

# OS
.DS_Store
Thumbs.db

# Editor
.idea/
.vscode/
*.swp

# Local env
.env
.env.local
EOF
```

- [ ] **Step 3: Clone 参考 repo 到 `reference/`（不提交）**

```bash
mkdir -p reference
git clone https://github.com/CaffuChin0/zmdgraph.git reference/zmdgraph
git clone https://github.com/MaaEnd/MaaEnd.git reference/MaaEnd
```

- [ ] **Step 4: 写占位 README**

```bash
cat > README.md <<'EOF'
# ZMD — 终末地养成规划器（本地版）

自用的《明日方舟：终末地》养成规划器。基于 [CaffuChin0/zmdgraph](https://github.com/CaffuChin0/zmdgraph) 的数据与计算逻辑重写，后续加入截图识别功能。

状态：开发中。

详见 `docs/superpowers/specs/2026-04-17-zmd-planner-design.md`。
EOF
```

- [ ] **Step 5: 确认参考数据可读**

```bash
ls reference/zmdgraph/js/
# 应该能看到 data.js planner.js stock.js operatorAdd.js 等
```

如果克隆失败或目录下看不到预期文件，**停下来**排查（网络/协议变更）再继续。

- [ ] **Step 6: 首次提交**

```bash
git add .gitignore README.md docs/
git commit -m "chore: init repo with spec and gitignore"
```

---

## Task 2：Scaffold 前端（Vite + React + TS）

**Files:**
- Create: `frontend/`（整个目录由 Vite 脚手架生成）
- Modify: `frontend/tsconfig.json`, `frontend/vite.config.ts`

- [ ] **Step 1: 用 Vite 创建项目**

```bash
cd /Users/nobuokita/Desktop/ZMD
pnpm create vite@latest frontend -- --template react-ts
cd frontend
pnpm install
```

如果用户没装 pnpm：`npm install -g pnpm` 或者把后续所有 `pnpm` 命令换成 `npm`。

- [ ] **Step 2: 删掉 Vite 默认样本**

```bash
rm src/App.css src/assets/react.svg public/vite.svg
```

- [ ] **Step 3: 替换 `src/App.tsx` 为最小 hello**

```tsx
// frontend/src/App.tsx
function App() {
  return <div className="p-8 text-2xl">ZMD — 终末地规划器</div>;
}

export default App;
```

- [ ] **Step 4: 验证 Vite 能起**

```bash
pnpm dev
# 打开 http://localhost:5173，能看到 "ZMD — 终末地规划器"
# Ctrl+C 停掉
```

- [ ] **Step 5: 配置 `@/` 别名指向 `src/`（shadcn/ui 需要）**

编辑 `frontend/tsconfig.json`，在 `compilerOptions` 里加：

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

编辑 `frontend/tsconfig.node.json`，确保 `compilerOptions` 里有 `"composite": true`。

编辑 `frontend/vite.config.ts`：

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

- [ ] **Step 6: 再跑一次验证**

```bash
pnpm dev
# Ctrl+C
```

- [ ] **Step 7: 提交**

```bash
cd ..
git add frontend/
git commit -m "feat(frontend): scaffold Vite + React + TS"
```

---

## Task 3：安装 Tailwind + shadcn/ui

**Files:**
- Create: `frontend/tailwind.config.js`, `frontend/postcss.config.js`
- Modify: `frontend/src/index.css`
- Create: `frontend/components.json`（shadcn 配置）
- Create: `frontend/src/lib/utils.ts`

- [ ] **Step 1: 装 Tailwind**

```bash
cd frontend
pnpm add -D tailwindcss@3 postcss autoprefixer
pnpm exec tailwindcss init -p
```

- [ ] **Step 2: 配置 `tailwind.config.js`**

覆盖为：

```js
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 3: 替换 `src/index.css` 为 shadcn 规范的 CSS 变量**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;
    --card: 0 0% 100%;
    --card-foreground: 240 10% 3.9%;
    --primary: 240 5.9% 10%;
    --primary-foreground: 0 0% 98%;
    --secondary: 240 4.8% 95.9%;
    --secondary-foreground: 240 5.9% 10%;
    --muted: 240 4.8% 95.9%;
    --muted-foreground: 240 3.8% 46.1%;
    --accent: 240 4.8% 95.9%;
    --accent-foreground: 240 5.9% 10%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 5.9% 90%;
    --input: 240 5.9% 90%;
    --ring: 240 5.9% 10%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 240 10% 3.9%;
    --foreground: 0 0% 98%;
    --card: 240 10% 3.9%;
    --card-foreground: 0 0% 98%;
    --primary: 0 0% 98%;
    --primary-foreground: 240 5.9% 10%;
    --secondary: 240 3.7% 15.9%;
    --secondary-foreground: 0 0% 98%;
    --muted: 240 3.7% 15.9%;
    --muted-foreground: 240 5% 64.9%;
    --accent: 240 3.7% 15.9%;
    --accent-foreground: 0 0% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 3.7% 15.9%;
    --input: 240 3.7% 15.9%;
    --ring: 240 4.9% 83.9%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

- [ ] **Step 4: 装 shadcn/ui 依赖工具**

```bash
pnpm add class-variance-authority clsx tailwind-merge lucide-react
pnpm add tailwindcss-animate
```

在 `tailwind.config.js` 的 `plugins` 数组里加 `require('tailwindcss-animate')`。因为是 ESM 配置文件，改成：

```js
import animate from 'tailwindcss-animate';
export default {
  // ...
  plugins: [animate],
};
```

- [ ] **Step 5: 创建 `src/lib/utils.ts`**

```ts
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 6: 初始化 shadcn/ui 元数据**

手动创建 `frontend/components.json`：

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.js",
    "css": "src/index.css",
    "baseColor": "zinc",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
```

- [ ] **Step 7: 安装第一批常用组件**

```bash
pnpm dlx shadcn@latest add button card input label table tabs dialog toast sonner
```

如有交互提示，一路接受默认。

- [ ] **Step 8: 用 Button 验证样式生效**

改 `src/App.tsx`：

```tsx
import { Button } from '@/components/ui/button';

function App() {
  return (
    <div className="min-h-screen flex items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">ZMD</h1>
      <Button>测试按钮</Button>
    </div>
  );
}

export default App;
```

- [ ] **Step 9: 再跑验证**

```bash
pnpm dev
# 按钮应该是 shadcn 风格（圆角、hover 效果）
# Ctrl+C
```

- [ ] **Step 10: 提交**

```bash
cd ..
git add frontend/
git commit -m "feat(frontend): add Tailwind + shadcn/ui"
```

---

## Task 4：移植材料数据（materials）

**Files:**
- Create: `frontend/src/data/materials.ts`
- Create: `frontend/src/data/types.ts`

背景：zmdgraph 的 `reference/zmdgraph/js/data.js` 里用 JS 对象定义了所有材料，形如 `{ id, name, icon, tier, ... }`。我们把它翻译成强类型 TS。

- [ ] **Step 1: 读 zmdgraph 的材料定义**

```bash
less reference/zmdgraph/js/data.js
# 定位到材料列表，记录每个材料对象的字段名和取值
# 如果字段名是中文 key，保留原字段名；如果是英文，直接沿用
```

- [ ] **Step 2: 写类型定义 `src/data/types.ts`**

```ts
// frontend/src/data/types.ts
export type MaterialId = string;
export type OperatorId = string;
export type WeaponId = string;

export interface Material {
  id: MaterialId;
  name: string;        // 中文名
  tier: number;        // 稀有度/星级
  iconKey: string;     // 前端图标查找键（文件名不带扩展名）
  category?: string;   // 作战记录 / 突破材料 / 等等
}

/** 某一级升到下一级的消耗。null 表示未知或不适用。 */
export interface LevelCost {
  exp: number;
  coin: number;        // 金币或同等通货
  materials?: { [id: MaterialId]: number };
}

export interface AscensionCost {
  stage: number;       // 当前阶段
  materials: { [id: MaterialId]: number };
  coin: number;
}
```

- [ ] **Step 3: 写 `src/data/materials.ts`，把 zmdgraph 里所有材料机械复制过来**

模板：

```ts
// frontend/src/data/materials.ts
import type { Material } from './types';

export const MATERIALS: Material[] = [
  // 例：从 zmdgraph data.js 逐条翻译
  { id: 'exp_t3', name: '中级作战记录', tier: 3, iconKey: 'exp_t3', category: 'exp' },
  { id: 'coin',   name: '龙门币',       tier: 1, iconKey: 'coin',   category: 'currency' },
  // ... 其他所有材料
];

export const MATERIAL_BY_ID: Record<string, Material> = Object.fromEntries(
  MATERIALS.map((m) => [m.id, m]),
);
```

**要求**：
- zmdgraph `data.js` 里有多少条材料，这里就要有多少条，一一对应。
- `id` 使用稳定 slug（全小写、下划线），不用中文，方便后续后端 JSON 对齐。
- 如果原数据用中文 key 作 id，建立映射表 `src/data/legacy-id-map.ts` 记录 `中文名 → slug`，但主数据源用 slug。

- [ ] **Step 4: 加一个 sanity 单测**

`frontend/src/data/materials.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { MATERIALS, MATERIAL_BY_ID } from './materials';

describe('materials data', () => {
  it('has no duplicate ids', () => {
    const ids = MATERIALS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('indexes every material', () => {
    for (const m of MATERIALS) {
      expect(MATERIAL_BY_ID[m.id]).toBe(m);
    }
  });

  it('has at least 10 materials', () => {
    expect(MATERIALS.length).toBeGreaterThanOrEqual(10);
  });
});
```

- [ ] **Step 5: 装 Vitest 并跑测试**

```bash
cd frontend
pnpm add -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

在 `package.json` 的 `scripts` 里加：

```json
"test": "vitest run",
"test:watch": "vitest"
```

在 `vite.config.ts` 补 `test` 字段：

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
```

```bash
pnpm test
# 预期：3 个测试全部通过
```

- [ ] **Step 6: 提交**

```bash
cd ..
git add frontend/
git commit -m "feat(data): port materials from zmdgraph"
```

---

## Task 5：移植干员数据（operators）

**Files:**
- Create: `frontend/src/data/operators.ts`
- Create: `frontend/src/data/operator-costs.ts`

zmdgraph 的 `js/data.js` 里有干员对象（包含等级消耗曲线和突破材料）。

- [ ] **Step 1: 定义干员类型（扩展 `src/data/types.ts`）**

在 `src/data/types.ts` 末尾加：

```ts
export type Profession = 'vanguard' | 'guard' | 'sniper' | 'caster' | 'medic' | 'defender' | 'specialist' | 'supporter' | string;

export interface Operator {
  id: OperatorId;
  name: string;
  rarity: number;          // 1-6
  profession: Profession;
  portraitKey: string;
  maxAscension: number;    // 通常 2 或 3
}

/** 每个 rarity+ascension 下的等级消耗曲线。 */
export interface OperatorLevelCurve {
  rarity: number;
  ascension: number;
  /** levelCosts[n] 表示 n → n+1 级的消耗。长度 = 该阶段最大等级 - 1。 */
  levelCosts: LevelCost[];
}

export interface OperatorAscensionCost extends AscensionCost {
  rarity: number;          // 该突破所属稀有度
}
```

- [ ] **Step 2: 写 `src/data/operators.ts`**

```ts
// frontend/src/data/operators.ts
import type { Operator } from './types';

export const OPERATORS: Operator[] = [
  // 例
  { id: 'angelina', name: '安洁莉娜', rarity: 6, profession: 'supporter', portraitKey: 'angelina', maxAscension: 2 },
  // ... 全部
];

export const OPERATOR_BY_ID: Record<string, Operator> = Object.fromEntries(
  OPERATORS.map((o) => [o.id, o]),
);
```

- [ ] **Step 3: 写 `src/data/operator-costs.ts`**

```ts
// frontend/src/data/operator-costs.ts
import type { OperatorLevelCurve, OperatorAscensionCost } from './types';

/** 按 rarity 和 ascension 索引。 */
export const LEVEL_CURVES: OperatorLevelCurve[] = [
  // {
  //   rarity: 6, ascension: 0,
  //   levelCosts: [
  //     { exp: 100, coin: 50 }, { exp: 110, coin: 55 }, ...
  //   ]
  // },
  // ... 所有 rarity × ascension 组合，照抄 zmdgraph
];

export const ASCENSION_COSTS: OperatorAscensionCost[] = [
  // { rarity: 6, stage: 1, coin: 30000, materials: { 'mat_a': 5, 'mat_b': 3 } },
  // ...
];

export function getLevelCurve(rarity: number, ascension: number) {
  return LEVEL_CURVES.find((c) => c.rarity === rarity && c.ascension === ascension);
}

export function getAscensionCost(rarity: number, stage: number) {
  return ASCENSION_COSTS.find((c) => c.rarity === rarity && c.stage === stage);
}
```

**要求**：zmdgraph 有多少稀有度×突破组合，这里就要有多少条；每个 `levelCosts` 数组长度等于该稀有度该突破阶段的最大等级减一。

- [ ] **Step 4: 单测**

`frontend/src/data/operators.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { OPERATORS, OPERATOR_BY_ID } from './operators';
import { LEVEL_CURVES, ASCENSION_COSTS, getLevelCurve } from './operator-costs';

describe('operators data', () => {
  it('has no duplicate ids', () => {
    const ids = OPERATORS.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every operator rarity has a level curve for ascension 0', () => {
    const rarities = new Set(OPERATORS.map((o) => o.rarity));
    for (const r of rarities) {
      expect(getLevelCurve(r, 0)).toBeDefined();
    }
  });

  it('ascension costs align with operator maxAscension', () => {
    const rarities = new Set(OPERATORS.map((o) => o.rarity));
    for (const r of rarities) {
      const op = OPERATORS.find((o) => o.rarity === r)!;
      for (let stage = 1; stage <= op.maxAscension; stage++) {
        expect(ASCENSION_COSTS.find((c) => c.rarity === r && c.stage === stage)).toBeDefined();
      }
    }
  });
});
```

```bash
cd frontend && pnpm test
# 预期：新测试通过
```

- [ ] **Step 5: 提交**

```bash
cd ..
git add frontend/
git commit -m "feat(data): port operators and level/ascension costs"
```

---

## Task 6：移植武器数据（weapons）

**Files:**
- Create: `frontend/src/data/weapons.ts`
- Create: `frontend/src/data/weapon-costs.ts`

结构跟 Task 5 类似，但武器数据可能更简单（没有"职业"概念）。

- [ ] **Step 1: 扩展类型**

在 `src/data/types.ts` 加：

```ts
export interface Weapon {
  id: WeaponId;
  name: string;
  rarity: number;
  iconKey: string;
  maxAscension: number;
}

export interface WeaponLevelCurve {
  rarity: number;
  ascension: number;
  levelCosts: LevelCost[];
}

export interface WeaponAscensionCost extends AscensionCost {
  rarity: number;
}
```

- [ ] **Step 2: 写 `src/data/weapons.ts` 和 `src/data/weapon-costs.ts`**

结构完全复制 operators 那套模式（参照 Task 5 Step 2 和 Step 3 的代码），字段名从 `Operator` 换成 `Weapon`，数据从 zmdgraph 武器部分照抄。

`src/data/weapons.ts`：

```ts
import type { Weapon } from './types';

export const WEAPONS: Weapon[] = [
  // { id: 'blade_of_dawn', name: '晨光之刃', rarity: 5, iconKey: 'blade_of_dawn', maxAscension: 2 },
  // ...
];

export const WEAPON_BY_ID: Record<string, Weapon> = Object.fromEntries(
  WEAPONS.map((w) => [w.id, w]),
);
```

`src/data/weapon-costs.ts`：

```ts
import type { WeaponLevelCurve, WeaponAscensionCost } from './types';

export const WEAPON_LEVEL_CURVES: WeaponLevelCurve[] = [
  // ...
];

export const WEAPON_ASCENSION_COSTS: WeaponAscensionCost[] = [
  // ...
];

export function getWeaponLevelCurve(rarity: number, ascension: number) {
  return WEAPON_LEVEL_CURVES.find((c) => c.rarity === rarity && c.ascension === ascension);
}

export function getWeaponAscensionCost(rarity: number, stage: number) {
  return WEAPON_ASCENSION_COSTS.find((c) => c.rarity === rarity && c.stage === stage);
}
```

- [ ] **Step 3: 单测**

`frontend/src/data/weapons.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { WEAPONS } from './weapons';
import { WEAPON_LEVEL_CURVES, getWeaponLevelCurve } from './weapon-costs';

describe('weapons data', () => {
  it('has no duplicate ids', () => {
    const ids = WEAPONS.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every rarity has an ascension-0 curve', () => {
    const rarities = new Set(WEAPONS.map((w) => w.rarity));
    for (const r of rarities) {
      expect(getWeaponLevelCurve(r, 0)).toBeDefined();
    }
  });
});
```

```bash
cd frontend && pnpm test
```

- [ ] **Step 4: 提交**

```bash
cd ..
git add frontend/
git commit -m "feat(data): port weapons and weapon costs"
```

---

## Task 7：规划计算逻辑（纯函数 TDD）

**Files:**
- Create: `frontend/src/logic/planner.ts`
- Create: `frontend/src/logic/planner.test.ts`

核心计算：给定某个干员（或武器）"当前 level/ascension → 目标 level/ascension"，聚合所有消耗成一个 `{material_id → count}` 映射。

- [ ] **Step 1: 先写失败测试**

`frontend/src/logic/planner.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import {
  computeOperatorCost,
  aggregateCosts,
  type CostMap,
} from './planner';

describe('computeOperatorCost', () => {
  it('returns empty cost when current == target', () => {
    const cost = computeOperatorCost({
      operator_id: 'angelina',
      current: { level: 30, ascension: 1 },
      target: { level: 30, ascension: 1 },
    });
    expect(cost).toEqual({ exp: 0, coin: 0, materials: {} });
  });

  it('sums level costs within same ascension', () => {
    // 假设 rarity-6 ascension-1 的 30→31 花 100 exp 50 coin，31→32 花 110 exp 55 coin
    const cost = computeOperatorCost({
      operator_id: 'angelina',
      current: { level: 30, ascension: 1 },
      target: { level: 32, ascension: 1 },
    });
    expect(cost.exp).toBe(210);
    expect(cost.coin).toBe(105);
  });

  it('includes ascension cost when crossing ascension', () => {
    const cost = computeOperatorCost({
      operator_id: 'angelina',
      current: { level: 50, ascension: 1 },
      target: { level: 1, ascension: 2 },
    });
    // ascension cost 的 materials 必须体现
    expect(Object.keys(cost.materials).length).toBeGreaterThan(0);
  });
});

describe('aggregateCosts', () => {
  it('sums multiple cost maps', () => {
    const a: CostMap = { exp: 100, coin: 50, materials: { mat_a: 2 } };
    const b: CostMap = { exp: 50, coin: 20, materials: { mat_a: 1, mat_b: 3 } };
    expect(aggregateCosts([a, b])).toEqual({
      exp: 150,
      coin: 70,
      materials: { mat_a: 3, mat_b: 3 },
    });
  });

  it('returns zero for empty array', () => {
    expect(aggregateCosts([])).toEqual({ exp: 0, coin: 0, materials: {} });
  });
});
```

**注意**：第二个和第三个 `computeOperatorCost` 测试里的具体数字依赖于 Task 5 里填的 `LEVEL_CURVES`。如果实际数据不同，**在实现前先改成与你真实数据匹配的数字**。关键是测试结构要覆盖这三种场景。

- [ ] **Step 2: 运行测试确认失败**

```bash
cd frontend && pnpm test -- planner
# 预期：FAIL（模块不存在）
```

- [ ] **Step 3: 实现 `src/logic/planner.ts`**

```ts
// frontend/src/logic/planner.ts
import { getLevelCurve, getAscensionCost } from '@/data/operator-costs';
import { OPERATOR_BY_ID } from '@/data/operators';
import { getWeaponLevelCurve, getWeaponAscensionCost } from '@/data/weapon-costs';
import { WEAPON_BY_ID } from '@/data/weapons';
import type { MaterialId } from '@/data/types';

export interface CostMap {
  exp: number;
  coin: number;
  materials: Record<MaterialId, number>;
}

export function emptyCost(): CostMap {
  return { exp: 0, coin: 0, materials: {} };
}

export function addCost(a: CostMap, b: CostMap): CostMap {
  const materials = { ...a.materials };
  for (const [id, count] of Object.entries(b.materials)) {
    materials[id] = (materials[id] ?? 0) + count;
  }
  return { exp: a.exp + b.exp, coin: a.coin + b.coin, materials };
}

export function aggregateCosts(costs: CostMap[]): CostMap {
  return costs.reduce((acc, c) => addCost(acc, c), emptyCost());
}

interface LevelPoint {
  level: number;
  ascension: number;
}

export interface OperatorPlan {
  operator_id: string;
  current: LevelPoint;
  target: LevelPoint;
}

export interface WeaponPlan {
  weapon_id: string;
  current: LevelPoint;
  target: LevelPoint;
}

/** 在同一 ascension 内从 current.level 到 target.level 的消耗。 */
function computeLevelRangeCost(
  rarity: number,
  ascension: number,
  fromLevel: number,
  toLevel: number,
  levelCurveFn: typeof getLevelCurve,
): CostMap {
  if (fromLevel >= toLevel) return emptyCost();
  const curve = levelCurveFn(rarity, ascension);
  if (!curve) {
    throw new Error(`No level curve for rarity=${rarity} ascension=${ascension}`);
  }
  let acc = emptyCost();
  for (let lv = fromLevel; lv < toLevel; lv++) {
    const step = curve.levelCosts[lv - 1];
    if (!step) throw new Error(`Missing level cost at lv=${lv} rarity=${rarity} asc=${ascension}`);
    acc = addCost(acc, {
      exp: step.exp,
      coin: step.coin,
      materials: step.materials ?? {},
    });
  }
  return acc;
}

export function computeOperatorCost(plan: OperatorPlan): CostMap {
  const op = OPERATOR_BY_ID[plan.operator_id];
  if (!op) throw new Error(`Unknown operator: ${plan.operator_id}`);
  let total = emptyCost();
  let cursor = { ...plan.current };

  while (cursor.ascension < plan.target.ascension) {
    // 升到当前 ascension 的最大等级
    const curve = getLevelCurve(op.rarity, cursor.ascension);
    if (!curve) throw new Error(`No curve for rarity=${op.rarity} asc=${cursor.ascension}`);
    const maxLevel = curve.levelCosts.length + 1;
    total = addCost(total, computeLevelRangeCost(op.rarity, cursor.ascension, cursor.level, maxLevel, getLevelCurve));
    // 突破
    const ascCost = getAscensionCost(op.rarity, cursor.ascension + 1);
    if (!ascCost) throw new Error(`No ascension cost for rarity=${op.rarity} stage=${cursor.ascension + 1}`);
    total = addCost(total, { exp: 0, coin: ascCost.coin, materials: ascCost.materials });
    cursor = { level: 1, ascension: cursor.ascension + 1 };
  }

  // 同一 ascension 内升到目标 level
  total = addCost(total, computeLevelRangeCost(op.rarity, cursor.ascension, cursor.level, plan.target.level, getLevelCurve));
  return total;
}

export function computeWeaponCost(plan: WeaponPlan): CostMap {
  const w = WEAPON_BY_ID[plan.weapon_id];
  if (!w) throw new Error(`Unknown weapon: ${plan.weapon_id}`);
  let total = emptyCost();
  let cursor = { ...plan.current };

  while (cursor.ascension < plan.target.ascension) {
    const curve = getWeaponLevelCurve(w.rarity, cursor.ascension);
    if (!curve) throw new Error(`No weapon curve for rarity=${w.rarity} asc=${cursor.ascension}`);
    const maxLevel = curve.levelCosts.length + 1;
    total = addCost(total, computeLevelRangeCost(w.rarity, cursor.ascension, cursor.level, maxLevel, getWeaponLevelCurve));
    const ascCost = getWeaponAscensionCost(w.rarity, cursor.ascension + 1);
    if (!ascCost) throw new Error(`No weapon ascension cost for rarity=${w.rarity} stage=${cursor.ascension + 1}`);
    total = addCost(total, { exp: 0, coin: ascCost.coin, materials: ascCost.materials });
    cursor = { level: 1, ascension: cursor.ascension + 1 };
  }

  total = addCost(total, computeLevelRangeCost(w.rarity, cursor.ascension, cursor.level, plan.target.level, getWeaponLevelCurve));
  return total;
}
```

- [ ] **Step 4: 运行测试**

```bash
pnpm test -- planner
# 预期：所有 planner 测试 PASS
```

如果因为 Task 5 的数据和测试里的数字对不上，修正测试里的期望数字使其匹配真实数据。

- [ ] **Step 5: 提交**

```bash
cd ..
git add frontend/
git commit -m "feat(logic): add planner cost calculation"
```

---

## Task 8：库存合并/扣减逻辑（纯函数 TDD）

**Files:**
- Create: `frontend/src/logic/stock.ts`
- Create: `frontend/src/logic/stock.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/logic/stock.test.ts
import { describe, expect, it } from 'vitest';
import { mergeStock, diffStock, isPlanAffordable, type Stock } from './stock';

describe('mergeStock', () => {
  it('adds counts when overwrite=false', () => {
    const a: Stock = { mat_a: 5 };
    const b: Stock = { mat_a: 3, mat_b: 10 };
    expect(mergeStock(a, b, { mode: 'add' })).toEqual({ mat_a: 8, mat_b: 10 });
  });

  it('overwrites counts when mode=replace', () => {
    const a: Stock = { mat_a: 5, mat_b: 2 };
    const b: Stock = { mat_a: 3 };
    expect(mergeStock(a, b, { mode: 'replace' })).toEqual({ mat_a: 3, mat_b: 2 });
  });
});

describe('diffStock', () => {
  it('returns missing materials when stock insufficient', () => {
    const have: Stock = { mat_a: 2 };
    const need: Stock = { mat_a: 5, mat_b: 3 };
    expect(diffStock(have, need)).toEqual({ mat_a: 3, mat_b: 3 });
  });

  it('returns empty when stock covers need', () => {
    const have: Stock = { mat_a: 10, mat_b: 5 };
    const need: Stock = { mat_a: 5, mat_b: 3 };
    expect(diffStock(have, need)).toEqual({});
  });
});

describe('isPlanAffordable', () => {
  it('true when diff is empty', () => {
    expect(isPlanAffordable({ mat_a: 5 }, { mat_a: 3 })).toBe(true);
  });
  it('false when any material short', () => {
    expect(isPlanAffordable({ mat_a: 5 }, { mat_a: 10 })).toBe(false);
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
cd frontend && pnpm test -- stock
# 预期：FAIL
```

- [ ] **Step 3: 实现**

```ts
// frontend/src/logic/stock.ts
import type { MaterialId } from '@/data/types';

export type Stock = Record<MaterialId, number>;

export type MergeMode = 'add' | 'replace';

export function mergeStock(base: Stock, patch: Stock, opts: { mode: MergeMode }): Stock {
  const out: Stock = { ...base };
  for (const [id, count] of Object.entries(patch)) {
    if (opts.mode === 'add') {
      out[id] = (out[id] ?? 0) + count;
    } else {
      out[id] = count;
    }
  }
  return out;
}

/** Returns a Stock whose entries are what's still missing (need − have, floored at 0, zero entries omitted). */
export function diffStock(have: Stock, need: Stock): Stock {
  const out: Stock = {};
  for (const [id, count] of Object.entries(need)) {
    const missing = count - (have[id] ?? 0);
    if (missing > 0) out[id] = missing;
  }
  return out;
}

export function isPlanAffordable(have: Stock, need: Stock): boolean {
  return Object.keys(diffStock(have, need)).length === 0;
}

/** Deducts `spent` from `have`, clamping at 0 and dropping zero entries. */
export function deductStock(have: Stock, spent: Stock): Stock {
  const out: Stock = {};
  for (const [id, count] of Object.entries(have)) {
    const remain = count - (spent[id] ?? 0);
    if (remain > 0) out[id] = remain;
  }
  // 保留 spent 里没出现在 have 的记录为 0（忽略）
  return out;
}
```

- [ ] **Step 4: 运行测试**

```bash
pnpm test -- stock
# 预期：PASS
```

- [ ] **Step 5: 提交**

```bash
cd ..
git add frontend/
git commit -m "feat(logic): add stock merge/diff/deduct"
```

---

## Task 9：全局 store（Zustand + localStorage）

**Files:**
- Create: `frontend/src/store/app-store.ts`
- Create: `frontend/src/store/app-store.test.ts`

- [ ] **Step 1: 装 Zustand**

```bash
cd frontend
pnpm add zustand
```

- [ ] **Step 2: 写失败测试**

```ts
// frontend/src/store/app-store.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from './app-store';

describe('app store', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState(useAppStore.getInitialState());
  });

  it('adds to stock by material id', () => {
    useAppStore.getState().addStock('mat_a', 5);
    expect(useAppStore.getState().stock['mat_a']).toBe(5);
    useAppStore.getState().addStock('mat_a', 3);
    expect(useAppStore.getState().stock['mat_a']).toBe(8);
  });

  it('sets stock directly (replace)', () => {
    useAppStore.getState().setStockQuantity('mat_a', 10);
    expect(useAppStore.getState().stock['mat_a']).toBe(10);
  });

  it('toggles dark mode', () => {
    const initial = useAppStore.getState().settings.darkMode;
    useAppStore.getState().toggleDarkMode();
    expect(useAppStore.getState().settings.darkMode).toBe(!initial);
  });

  it('adds owned operator', () => {
    useAppStore.getState().setOwnedOperator('angelina', { level: 30, ascension: 1 });
    expect(useAppStore.getState().ownedOperators['angelina']).toEqual({ level: 30, ascension: 1 });
  });

  it('adds operator plan', () => {
    const plan = {
      operator_id: 'angelina',
      current: { level: 30, ascension: 1 },
      target: { level: 60, ascension: 2 },
    };
    useAppStore.getState().upsertOperatorPlan(plan);
    expect(useAppStore.getState().operatorPlans).toHaveLength(1);
    expect(useAppStore.getState().operatorPlans[0].target.level).toBe(60);
  });

  it('exports and imports state', () => {
    useAppStore.getState().addStock('mat_a', 5);
    const snapshot = useAppStore.getState().exportSnapshot();
    useAppStore.setState(useAppStore.getInitialState());
    useAppStore.getState().importSnapshot(snapshot);
    expect(useAppStore.getState().stock['mat_a']).toBe(5);
  });
});
```

- [ ] **Step 3: 运行确认失败**

```bash
pnpm test -- app-store
# FAIL
```

- [ ] **Step 4: 实现 store**

```ts
// frontend/src/store/app-store.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Stock } from '@/logic/stock';
import type { OperatorPlan, WeaponPlan } from '@/logic/planner';

interface OwnedOperator {
  level: number;
  ascension: number;
}

interface OwnedWeapon {
  level: number;
  ascension: number;
}

interface Settings {
  darkMode: boolean;
}

interface AppState {
  stock: Stock;
  ownedOperators: Record<string, OwnedOperator>;
  ownedWeapons: Record<string, OwnedWeapon>;
  operatorPlans: OperatorPlan[];
  weaponPlans: WeaponPlan[];
  settings: Settings;

  // Stock
  addStock: (materialId: string, count: number) => void;
  setStockQuantity: (materialId: string, count: number) => void;
  removeStock: (materialId: string) => void;
  replaceStock: (newStock: Stock) => void;

  // Operators
  setOwnedOperator: (id: string, data: OwnedOperator) => void;
  removeOwnedOperator: (id: string) => void;
  upsertOperatorPlan: (plan: OperatorPlan) => void;
  removeOperatorPlan: (operatorId: string) => void;

  // Weapons
  setOwnedWeapon: (id: string, data: OwnedWeapon) => void;
  removeOwnedWeapon: (id: string) => void;
  upsertWeaponPlan: (plan: WeaponPlan) => void;
  removeWeaponPlan: (weaponId: string) => void;

  // Settings
  toggleDarkMode: () => void;

  // Import/Export
  exportSnapshot: () => string;
  importSnapshot: (json: string) => void;
}

const INITIAL: Omit<AppState,
  | 'addStock' | 'setStockQuantity' | 'removeStock' | 'replaceStock'
  | 'setOwnedOperator' | 'removeOwnedOperator' | 'upsertOperatorPlan' | 'removeOperatorPlan'
  | 'setOwnedWeapon' | 'removeOwnedWeapon' | 'upsertWeaponPlan' | 'removeWeaponPlan'
  | 'toggleDarkMode' | 'exportSnapshot' | 'importSnapshot'
> = {
  stock: {},
  ownedOperators: {},
  ownedWeapons: {},
  operatorPlans: [],
  weaponPlans: [],
  settings: { darkMode: false },
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...INITIAL,

      addStock: (id, count) =>
        set((s) => ({ stock: { ...s.stock, [id]: (s.stock[id] ?? 0) + count } })),
      setStockQuantity: (id, count) =>
        set((s) => ({ stock: { ...s.stock, [id]: count } })),
      removeStock: (id) =>
        set((s) => {
          const { [id]: _, ...rest } = s.stock;
          return { stock: rest };
        }),
      replaceStock: (newStock) => set({ stock: newStock }),

      setOwnedOperator: (id, data) =>
        set((s) => ({ ownedOperators: { ...s.ownedOperators, [id]: data } })),
      removeOwnedOperator: (id) =>
        set((s) => {
          const { [id]: _, ...rest } = s.ownedOperators;
          return { ownedOperators: rest };
        }),
      upsertOperatorPlan: (plan) =>
        set((s) => {
          const others = s.operatorPlans.filter((p) => p.operator_id !== plan.operator_id);
          return { operatorPlans: [...others, plan] };
        }),
      removeOperatorPlan: (operatorId) =>
        set((s) => ({ operatorPlans: s.operatorPlans.filter((p) => p.operator_id !== operatorId) })),

      setOwnedWeapon: (id, data) =>
        set((s) => ({ ownedWeapons: { ...s.ownedWeapons, [id]: data } })),
      removeOwnedWeapon: (id) =>
        set((s) => {
          const { [id]: _, ...rest } = s.ownedWeapons;
          return { ownedWeapons: rest };
        }),
      upsertWeaponPlan: (plan) =>
        set((s) => {
          const others = s.weaponPlans.filter((p) => p.weapon_id !== plan.weapon_id);
          return { weaponPlans: [...others, plan] };
        }),
      removeWeaponPlan: (weaponId) =>
        set((s) => ({ weaponPlans: s.weaponPlans.filter((p) => p.weapon_id !== weaponId) })),

      toggleDarkMode: () =>
        set((s) => ({ settings: { ...s.settings, darkMode: !s.settings.darkMode } })),

      exportSnapshot: () => {
        const { stock, ownedOperators, ownedWeapons, operatorPlans, weaponPlans, settings } = get();
        return JSON.stringify(
          { stock, ownedOperators, ownedWeapons, operatorPlans, weaponPlans, settings },
          null,
          2,
        );
      },
      importSnapshot: (json) => {
        const parsed = JSON.parse(json);
        set({
          stock: parsed.stock ?? {},
          ownedOperators: parsed.ownedOperators ?? {},
          ownedWeapons: parsed.ownedWeapons ?? {},
          operatorPlans: parsed.operatorPlans ?? [],
          weaponPlans: parsed.weaponPlans ?? [],
          settings: parsed.settings ?? { darkMode: false },
        });
      },
    }),
    {
      name: 'zmd-planner-state',
      version: 1,
    },
  ),
);
```

- [ ] **Step 5: 运行测试**

```bash
pnpm test -- app-store
# PASS
```

- [ ] **Step 6: 提交**

```bash
cd ..
git add frontend/
git commit -m "feat(store): add zustand store with localStorage persist"
```

---

## Task 10：App 外壳、路由、导航栏

**Files:**
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/components/layout/AppShell.tsx`
- Create: `frontend/src/components/layout/Nav.tsx`
- Create: `frontend/src/pages/HomePage.tsx`, `StockPage.tsx`, `OperatorsPage.tsx`, `WeaponsPage.tsx`, `PlannerPage.tsx`, `SettingsPage.tsx`（占位）

- [ ] **Step 1: 装 React Router**

```bash
cd frontend
pnpm add react-router-dom
```

- [ ] **Step 2: 写各页面占位**

每个文件一行 JSX，例如：

```tsx
// frontend/src/pages/HomePage.tsx
export default function HomePage() {
  return <div className="p-6"><h2 className="text-xl font-semibold">首页</h2><p className="text-muted-foreground mt-2">从左侧导航进入各模块。</p></div>;
}
```

照此模式创建：`StockPage.tsx`（标题"库存"）、`OperatorsPage.tsx`（"干员"）、`WeaponsPage.tsx`（"武器"）、`PlannerPage.tsx`（"规划"）、`SettingsPage.tsx`（"设置"）。

- [ ] **Step 3: 写 `Nav.tsx`**

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
            cn(
              'px-3 py-2 rounded-md text-sm hover:bg-accent',
              isActive && 'bg-accent font-medium',
            )
          }
        >
          {l.label}
        </NavLink>
      ))}
    </nav>
  );
}
```

- [ ] **Step 4: 写 `AppShell.tsx`**

```tsx
// frontend/src/components/layout/AppShell.tsx
import { Outlet } from 'react-router-dom';
import { Nav } from './Nav';
import { useEffect } from 'react';
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

- [ ] **Step 5: 替换 `App.tsx` 为路由根**

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

- [ ] **Step 6: 人工验证**

```bash
pnpm dev
# 访问 http://localhost:5173，点每个菜单项能进入对应占位页
# Ctrl+C
```

- [ ] **Step 7: 提交**

```bash
cd ..
git add frontend/
git commit -m "feat(frontend): add routing and app shell"
```

---

## Task 11：库存页（Stock）

**Files:**
- Rewrite: `frontend/src/pages/StockPage.tsx`
- Create: `frontend/src/components/stock/StockTable.tsx`

- [ ] **Step 1: 实现 `StockTable.tsx`**

```tsx
// frontend/src/components/stock/StockTable.tsx
import { MATERIALS } from '@/data/materials';
import { useAppStore } from '@/store/app-store';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

export function StockTable() {
  const stock = useAppStore((s) => s.stock);
  const setStockQuantity = useAppStore((s) => s.setStockQuantity);
  const removeStock = useAppStore((s) => s.removeStock);
  const [filter, setFilter] = useState('');

  const rows = MATERIALS.filter((m) =>
    filter ? m.name.includes(filter) || m.id.includes(filter.toLowerCase()) : true,
  );

  return (
    <div className="space-y-3">
      <Input
        placeholder="搜索材料..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="max-w-xs"
      />
      <div className="border rounded-md divide-y">
        {rows.map((m) => {
          const current = stock[m.id] ?? 0;
          return (
            <div key={m.id} className="flex items-center gap-4 p-3">
              <div className="flex-1">
                <div className="font-medium">{m.name}</div>
                <div className="text-xs text-muted-foreground">{m.id} · 稀有度 {m.tier}</div>
              </div>
              <Input
                type="number"
                min={0}
                value={current}
                onChange={(e) => setStockQuantity(m.id, Math.max(0, Number(e.target.value) || 0))}
                className="w-28"
              />
              {current > 0 && (
                <Button variant="ghost" size="sm" onClick={() => removeStock(m.id)}>
                  清零
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 改 `StockPage.tsx`**

```tsx
// frontend/src/pages/StockPage.tsx
import { StockTable } from '@/components/stock/StockTable';

export default function StockPage() {
  return (
    <div className="p-6 space-y-4">
      <h2 className="text-2xl font-semibold">库存</h2>
      <p className="text-sm text-muted-foreground">手动输入每种材料的持有数量，数据自动保存在浏览器本地。</p>
      <StockTable />
    </div>
  );
}
```

- [ ] **Step 3: 人工验证**

```bash
cd frontend && pnpm dev
# 访问 /stock，输入数字，刷新页面数据应该还在（localStorage）
# Ctrl+C
```

- [ ] **Step 4: 提交**

```bash
cd ..
git add frontend/
git commit -m "feat(stock): stock page with per-material input"
```

---

## Task 12：干员页（Operators）

**Files:**
- Rewrite: `frontend/src/pages/OperatorsPage.tsx`
- Create: `frontend/src/components/operators/OperatorList.tsx`
- Create: `frontend/src/components/operators/OperatorEditDialog.tsx`

- [ ] **Step 1: 实现 `OperatorEditDialog.tsx`**

```tsx
// frontend/src/components/operators/OperatorEditDialog.tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState, useEffect } from 'react';
import type { Operator } from '@/data/types';

interface OperatorEditDialogProps {
  operator: Operator | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: { level: number; ascension: number };
  onSave: (level: number, ascension: number) => void;
  onRemove?: () => void;
}

export function OperatorEditDialog({ operator, open, onOpenChange, initial, onSave, onRemove }: OperatorEditDialogProps) {
  const [level, setLevel] = useState(initial?.level ?? 1);
  const [ascension, setAscension] = useState(initial?.ascension ?? 0);

  useEffect(() => {
    setLevel(initial?.level ?? 1);
    setAscension(initial?.ascension ?? 0);
  }, [initial, open]);

  if (!operator) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{operator.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>当前等级</Label>
            <Input type="number" min={1} value={level} onChange={(e) => setLevel(Math.max(1, Number(e.target.value) || 1))} />
          </div>
          <div>
            <Label>当前突破</Label>
            <Input type="number" min={0} max={operator.maxAscension} value={ascension} onChange={(e) => setAscension(Math.max(0, Math.min(operator.maxAscension, Number(e.target.value) || 0)))} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          {onRemove && <Button variant="destructive" onClick={onRemove}>移除</Button>}
          <Button onClick={() => onSave(level, ascension)}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: 实现 `OperatorList.tsx`**

```tsx
// frontend/src/components/operators/OperatorList.tsx
import { useState } from 'react';
import { OPERATORS } from '@/data/operators';
import { useAppStore } from '@/store/app-store';
import { OperatorEditDialog } from './OperatorEditDialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { Operator } from '@/data/types';

export function OperatorList() {
  const owned = useAppStore((s) => s.ownedOperators);
  const setOwnedOperator = useAppStore((s) => s.setOwnedOperator);
  const removeOwnedOperator = useAppStore((s) => s.removeOwnedOperator);

  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<Operator | null>(null);

  const rows = OPERATORS.filter((o) => (filter ? o.name.includes(filter) || o.id.includes(filter.toLowerCase()) : true));

  return (
    <div className="space-y-3">
      <Input placeholder="搜索干员..." value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-xs" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {rows.map((o) => {
          const has = owned[o.id];
          return (
            <div key={o.id} className={`border rounded-md p-3 flex items-center justify-between ${has ? 'bg-accent/40' : ''}`}>
              <div>
                <div className="font-medium">{o.name}</div>
                <div className="text-xs text-muted-foreground">
                  {o.rarity}★ · {has ? `Lv.${has.level} 突破${has.ascension}` : '未持有'}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setEditing(o)}>
                {has ? '编辑' : '添加'}
              </Button>
            </div>
          );
        })}
      </div>

      <OperatorEditDialog
        operator={editing}
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        initial={editing ? owned[editing.id] : undefined}
        onSave={(level, ascension) => {
          if (editing) {
            setOwnedOperator(editing.id, { level, ascension });
            setEditing(null);
          }
        }}
        onRemove={editing && owned[editing.id] ? () => {
          removeOwnedOperator(editing.id);
          setEditing(null);
        } : undefined}
      />
    </div>
  );
}
```

- [ ] **Step 3: 改 `OperatorsPage.tsx`**

```tsx
// frontend/src/pages/OperatorsPage.tsx
import { OperatorList } from '@/components/operators/OperatorList';

export default function OperatorsPage() {
  return (
    <div className="p-6 space-y-4">
      <h2 className="text-2xl font-semibold">干员</h2>
      <p className="text-sm text-muted-foreground">标记你已持有的干员及当前等级/突破。</p>
      <OperatorList />
    </div>
  );
}
```

- [ ] **Step 4: 验证**

```bash
cd frontend && pnpm dev
# 访问 /operators，搜索、添加、编辑、移除应该都能用
# Ctrl+C
```

- [ ] **Step 5: 提交**

```bash
cd ..
git add frontend/
git commit -m "feat(operators): operator list with edit dialog"
```

---

## Task 13：武器页（Weapons）

**Files:**
- Rewrite: `frontend/src/pages/WeaponsPage.tsx`
- Create: `frontend/src/components/weapons/WeaponList.tsx`
- Create: `frontend/src/components/weapons/WeaponEditDialog.tsx`

结构复制 Task 12 的 pattern，把 `Operator` / `OPERATORS` / `ownedOperators` / `setOwnedOperator` / `removeOwnedOperator` 换成 `Weapon` / `WEAPONS` / `ownedWeapons` / `setOwnedWeapon` / `removeOwnedWeapon`。

- [ ] **Step 1: 创建 `WeaponEditDialog.tsx`**（复制 `OperatorEditDialog.tsx` 并把类型换成 `Weapon`）

- [ ] **Step 2: 创建 `WeaponList.tsx`**（复制 `OperatorList.tsx` 并替换所有 Operator 相关名称）

- [ ] **Step 3: 改 `WeaponsPage.tsx`**

```tsx
import { WeaponList } from '@/components/weapons/WeaponList';

export default function WeaponsPage() {
  return (
    <div className="p-6 space-y-4">
      <h2 className="text-2xl font-semibold">武器</h2>
      <p className="text-sm text-muted-foreground">标记你已持有的武器及当前强化/突破。</p>
      <WeaponList />
    </div>
  );
}
```

- [ ] **Step 4: 验证 + 提交**

```bash
cd frontend && pnpm dev
# 验证 /weapons
# Ctrl+C

cd ..
git add frontend/
git commit -m "feat(weapons): weapon list with edit dialog"
```

---

## Task 14：规划页（Planner）

**Files:**
- Rewrite: `frontend/src/pages/PlannerPage.tsx`
- Create: `frontend/src/components/planner/PlanEditor.tsx`
- Create: `frontend/src/components/planner/CostSummary.tsx`
- Create: `frontend/src/logic/planner-aggregator.ts`
- Create: `frontend/src/logic/planner-aggregator.test.ts`

规划页展示：
1. 所有干员/武器规划列表（add/edit/remove）
2. 聚合总消耗（exp、coin、每种材料）
3. 对比库存，显示"还缺"
4. 一键"完成该规划，从库存扣减所需材料 + 把目标等级写回已持有"

- [ ] **Step 1: 先写聚合逻辑的 TDD**

```ts
// frontend/src/logic/planner-aggregator.test.ts
import { describe, expect, it, beforeEach } from 'vitest';
import { computeAllPlannedCost } from './planner-aggregator';
import { useAppStore } from '@/store/app-store';

describe('computeAllPlannedCost', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState(useAppStore.getInitialState());
  });

  it('returns empty cost when no plans', () => {
    const cost = computeAllPlannedCost();
    expect(cost.exp).toBe(0);
    expect(cost.coin).toBe(0);
    expect(Object.keys(cost.materials)).toHaveLength(0);
  });

  it('sums operator and weapon plans', () => {
    useAppStore.getState().upsertOperatorPlan({
      operator_id: 'angelina',
      current: { level: 1, ascension: 0 },
      target: { level: 2, ascension: 0 },
    });
    const cost = computeAllPlannedCost();
    expect(cost.exp).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
cd frontend && pnpm test -- planner-aggregator
# FAIL
```

- [ ] **Step 3: 实现 `planner-aggregator.ts`**

```ts
// frontend/src/logic/planner-aggregator.ts
import { useAppStore } from '@/store/app-store';
import { aggregateCosts, computeOperatorCost, computeWeaponCost, type CostMap } from './planner';

export function computeAllPlannedCost(): CostMap {
  const { operatorPlans, weaponPlans } = useAppStore.getState();
  const opCosts = operatorPlans.map(computeOperatorCost);
  const wpCosts = weaponPlans.map(computeWeaponCost);
  return aggregateCosts([...opCosts, ...wpCosts]);
}
```

- [ ] **Step 4: 运行测试通过**

```bash
pnpm test -- planner-aggregator
# PASS
```

- [ ] **Step 5: 实现 `PlanEditor.tsx`**

```tsx
// frontend/src/components/planner/PlanEditor.tsx
import { useState } from 'react';
import { OPERATORS } from '@/data/operators';
import { WEAPONS } from '@/data/weapons';
import { useAppStore } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function PlanEditor() {
  const plans = useAppStore((s) => s.operatorPlans);
  const wPlans = useAppStore((s) => s.weaponPlans);
  const ownedOps = useAppStore((s) => s.ownedOperators);
  const ownedWps = useAppStore((s) => s.ownedWeapons);
  const upsertOp = useAppStore((s) => s.upsertOperatorPlan);
  const removeOp = useAppStore((s) => s.removeOperatorPlan);
  const upsertWp = useAppStore((s) => s.upsertWeaponPlan);
  const removeWp = useAppStore((s) => s.removeWeaponPlan);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [kind, setKind] = useState<'operator' | 'weapon'>('operator');
  const [selectedId, setSelectedId] = useState('');
  const [currentLevel, setCurrentLevel] = useState(1);
  const [currentAsc, setCurrentAsc] = useState(0);
  const [targetLevel, setTargetLevel] = useState(10);
  const [targetAsc, setTargetAsc] = useState(0);

  function openForNew(k: 'operator' | 'weapon') {
    setKind(k);
    setSelectedId('');
    const has = k === 'operator' ? undefined : undefined;
    setCurrentLevel(has?.level ?? 1);
    setCurrentAsc(has?.ascension ?? 0);
    setTargetLevel(10);
    setTargetAsc(0);
    setDialogOpen(true);
  }

  function handleSave() {
    if (!selectedId) return;
    if (kind === 'operator') {
      upsertOp({ operator_id: selectedId, current: { level: currentLevel, ascension: currentAsc }, target: { level: targetLevel, ascension: targetAsc } });
    } else {
      upsertWp({ weapon_id: selectedId, current: { level: currentLevel, ascension: currentAsc }, target: { level: targetLevel, ascension: targetAsc } });
    }
    setDialogOpen(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button onClick={() => openForNew('operator')}>添加干员规划</Button>
        <Button variant="outline" onClick={() => openForNew('weapon')}>添加武器规划</Button>
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold">干员规划</h3>
        {plans.length === 0 && <div className="text-sm text-muted-foreground">暂无。</div>}
        {plans.map((p) => {
          const op = OPERATORS.find((o) => o.id === p.operator_id);
          return (
            <div key={p.operator_id} className="border rounded-md p-3 flex items-center justify-between">
              <div>
                <div className="font-medium">{op?.name ?? p.operator_id}</div>
                <div className="text-xs text-muted-foreground">
                  Lv.{p.current.level}（突破{p.current.ascension}）→ Lv.{p.target.level}（突破{p.target.ascension}）
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => removeOp(p.operator_id)}>移除</Button>
            </div>
          );
        })}
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold">武器规划</h3>
        {wPlans.length === 0 && <div className="text-sm text-muted-foreground">暂无。</div>}
        {wPlans.map((p) => {
          const w = WEAPONS.find((x) => x.id === p.weapon_id);
          return (
            <div key={p.weapon_id} className="border rounded-md p-3 flex items-center justify-between">
              <div>
                <div className="font-medium">{w?.name ?? p.weapon_id}</div>
                <div className="text-xs text-muted-foreground">
                  Lv.{p.current.level}（突破{p.current.ascension}）→ Lv.{p.target.level}（突破{p.target.ascension}）
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => removeWp(p.weapon_id)}>移除</Button>
            </div>
          );
        })}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{kind === 'operator' ? '添加干员规划' : '添加武器规划'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{kind === 'operator' ? '干员' : '武器'}</Label>
              <select
                className="w-full border rounded-md px-2 py-1.5 bg-background"
                value={selectedId}
                onChange={(e) => {
                  setSelectedId(e.target.value);
                  const has = kind === 'operator' ? ownedOps[e.target.value] : ownedWps[e.target.value];
                  if (has) {
                    setCurrentLevel(has.level);
                    setCurrentAsc(has.ascension);
                  }
                }}
              >
                <option value="">-- 请选择 --</option>
                {(kind === 'operator' ? OPERATORS : WEAPONS).map((x) => (
                  <option key={x.id} value={x.id}>{x.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>当前等级</Label><Input type="number" min={1} value={currentLevel} onChange={(e) => setCurrentLevel(Math.max(1, Number(e.target.value) || 1))} /></div>
              <div><Label>当前突破</Label><Input type="number" min={0} value={currentAsc} onChange={(e) => setCurrentAsc(Math.max(0, Number(e.target.value) || 0))} /></div>
              <div><Label>目标等级</Label><Input type="number" min={1} value={targetLevel} onChange={(e) => setTargetLevel(Math.max(1, Number(e.target.value) || 1))} /></div>
              <div><Label>目标突破</Label><Input type="number" min={0} value={targetAsc} onChange={(e) => setTargetAsc(Math.max(0, Number(e.target.value) || 0))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSave} disabled={!selectedId}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 6: 实现 `CostSummary.tsx`**

```tsx
// frontend/src/components/planner/CostSummary.tsx
import { useAppStore } from '@/store/app-store';
import { computeAllPlannedCost } from '@/logic/planner-aggregator';
import { diffStock } from '@/logic/stock';
import { MATERIAL_BY_ID } from '@/data/materials';
import { Button } from '@/components/ui/button';

export function CostSummary() {
  const stock = useAppStore((s) => s.stock);
  const replaceStock = useAppStore((s) => s.replaceStock);
  const operatorPlans = useAppStore((s) => s.operatorPlans);
  const weaponPlans = useAppStore((s) => s.weaponPlans);
  const setOwnedOperator = useAppStore((s) => s.setOwnedOperator);
  const setOwnedWeapon = useAppStore((s) => s.setOwnedWeapon);
  const removeOperatorPlan = useAppStore((s) => s.removeOperatorPlan);
  const removeWeaponPlan = useAppStore((s) => s.removeWeaponPlan);

  const cost = computeAllPlannedCost();
  const missing = diffStock(stock, cost.materials);

  function completeAll() {
    // 扣减库存
    const newStock = { ...stock };
    for (const [id, n] of Object.entries(cost.materials)) {
      newStock[id] = Math.max(0, (newStock[id] ?? 0) - n);
    }
    replaceStock(newStock);
    // 目标写回已持有 + 清除规划
    for (const p of operatorPlans) {
      setOwnedOperator(p.operator_id, { level: p.target.level, ascension: p.target.ascension });
      removeOperatorPlan(p.operator_id);
    }
    for (const p of weaponPlans) {
      setOwnedWeapon(p.weapon_id, { level: p.target.level, ascension: p.target.ascension });
      removeWeaponPlan(p.weapon_id);
    }
  }

  const hasPlans = operatorPlans.length > 0 || weaponPlans.length > 0;

  return (
    <div className="border rounded-md p-4 space-y-3">
      <h3 className="font-semibold">消耗汇总</h3>
      <div className="text-sm grid grid-cols-2 gap-y-1">
        <div>总 EXP</div><div className="text-right font-mono">{cost.exp.toLocaleString()}</div>
        <div>总金币</div><div className="text-right font-mono">{cost.coin.toLocaleString()}</div>
      </div>
      <div>
        <div className="text-sm font-medium mb-1">材料消耗</div>
        {Object.keys(cost.materials).length === 0 && <div className="text-xs text-muted-foreground">无</div>}
        <div className="grid grid-cols-2 gap-y-1 text-sm">
          {Object.entries(cost.materials).map(([id, n]) => {
            const have = stock[id] ?? 0;
            const short = have < n;
            return (
              <div key={id} className="contents">
                <div>{MATERIAL_BY_ID[id]?.name ?? id}</div>
                <div className={`text-right font-mono ${short ? 'text-destructive' : ''}`}>
                  {have} / {n} {short && `(缺 ${n - have})`}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {Object.keys(missing).length === 0 && hasPlans && (
        <Button onClick={completeAll}>完成全部规划（扣减库存）</Button>
      )}
    </div>
  );
}
```

- [ ] **Step 7: 改 `PlannerPage.tsx`**

```tsx
// frontend/src/pages/PlannerPage.tsx
import { PlanEditor } from '@/components/planner/PlanEditor';
import { CostSummary } from '@/components/planner/CostSummary';

export default function PlannerPage() {
  return (
    <div className="p-6 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">规划</h2>
        <PlanEditor />
      </div>
      <CostSummary />
    </div>
  );
}
```

- [ ] **Step 8: 人工验证**

```bash
cd frontend && pnpm dev
# 访问 /planner
# 1. 添加一个干员规划，汇总右侧应实时更新
# 2. /stock 里手动塞足够库存，回 /planner 看是否出现"完成全部规划"按钮
# 3. 点击后规划应清空，已持有等级更新，库存扣减
# Ctrl+C
```

- [ ] **Step 9: 提交**

```bash
cd ..
git add frontend/
git commit -m "feat(planner): planner page with cost summary and completion"
```

---

## Task 15：设置页（备份/导入/深色模式）

**Files:**
- Rewrite: `frontend/src/pages/SettingsPage.tsx`

- [ ] **Step 1: 实现 `SettingsPage.tsx`**

```tsx
// frontend/src/pages/SettingsPage.tsx
import { useAppStore } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import { useRef, useState } from 'react';

export default function SettingsPage() {
  const darkMode = useAppStore((s) => s.settings.darkMode);
  const toggleDarkMode = useAppStore((s) => s.toggleDarkMode);
  const exportSnapshot = useAppStore((s) => s.exportSnapshot);
  const importSnapshot = useAppStore((s) => s.importSnapshot);
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);

  function handleExport() {
    const json = exportSnapshot();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zmd-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage('已导出备份');
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importSnapshot(reader.result as string);
        setMessage('已导入备份');
      } catch (err) {
        setMessage('导入失败：JSON 格式不正确');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  return (
    <div className="p-6 space-y-6 max-w-xl">
      <h2 className="text-2xl font-semibold">设置</h2>

      <section className="space-y-2">
        <h3 className="font-semibold">外观</h3>
        <Button variant="outline" onClick={toggleDarkMode}>
          {darkMode ? '切换为浅色' : '切换为深色'}
        </Button>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold">备份与恢复</h3>
        <p className="text-sm text-muted-foreground">数据存储在浏览器 localStorage，换浏览器或清除数据前请导出。</p>
        <div className="flex gap-2">
          <Button onClick={handleExport}>导出 JSON</Button>
          <Button variant="outline" onClick={() => fileInput.current?.click()}>导入 JSON</Button>
          <input ref={fileInput} type="file" accept="application/json" className="hidden" onChange={handleImport} />
        </div>
        {message && <div className="text-sm text-muted-foreground">{message}</div>}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: 验证**

```bash
cd frontend && pnpm dev
# /settings：
# 1. 切换深色模式生效
# 2. 导出文件下载 OK
# 3. 清 localStorage 后重新导入，数据恢复
# Ctrl+C
```

- [ ] **Step 3: 提交**

```bash
cd ..
git add frontend/
git commit -m "feat(settings): dark mode + backup/restore"
```

---

## Task 16：README + 本地运行说明

**Files:**
- Rewrite: `README.md`

- [ ] **Step 1: 写 README**

```md
# ZMD — 终末地养成规划器（本地版）

基于 [CaffuChin0/zmdgraph](https://github.com/CaffuChin0/zmdgraph) 的数据和计算逻辑重写的《明日方舟：终末地》养成规划器。纯本地运行，数据存浏览器 localStorage。

v1（当前）：前端规划器。
v2（计划）：Python 后端 + 截图自动识别库存/干员。

## 启动

### 前置依赖
- Node.js 20+
- pnpm（或 npm/yarn）

### 运行

\`\`\`bash
cd frontend
pnpm install   # 首次
pnpm dev
# 访问 http://localhost:5173
\`\`\`

## 数据管理

- 所有用户数据（库存、干员、武器、规划）存在浏览器 localStorage。
- 到"设置"页可以**导出 JSON**（跨设备或换浏览器时用），以及**导入 JSON** 恢复。

## 功能清单（v1）

- 材料库存管理
- 已持有干员/武器管理
- 规划：选择干员/武器的目标等级+突破，自动聚合所有材料消耗
- 规划完成后一键扣减库存、回写已持有等级
- 深色模式

## 未来（v2）

- 后端 FastAPI + OpenCV + PaddleOCR，从库存截图自动识别材料数量
- 同样的方式识别干员列表

## 开发

\`\`\`bash
cd frontend
pnpm test         # 跑单测
pnpm build        # 打包
\`\`\`

## 数据源

- 游戏数据（材料、干员、武器、消耗表）移植自 [CaffuChin0/zmdgraph](https://github.com/CaffuChin0/zmdgraph) 的 \`js/data.js\`。
- 后续图标素材计划来自 [MaaEnd/MaaEnd](https://github.com/MaaEnd/MaaEnd) 的 \`assets/\`（以上游许可证为准）。
\`\`\`

- [ ] **Step 2: 提交**

```bash
git add README.md
git commit -m "docs: write README with setup and usage"
```

---

## Self-Review Notes

本 Plan 的 spec 覆盖检查：

| Spec 章节 | 覆盖于 |
|----------|-------|
| §1 范围 — 规划功能 | Task 4-15 |
| §2 架构 — 前端 SPA | Task 2-3, 10 |
| §4 数据模型 — localStorage | Task 9 |
| §5 目录结构 — frontend/ | Task 2-15 |
| §6 运行 — Vite 本地跑 | Task 16 |
| §7 测试 — Vitest 对纯函数 | Task 4-9, 14 |
| §3 识别管线 | **Plan B**（本 plan 不覆盖） |
| §6 运行 — start.sh 前后端一起 | **Plan B**（加后端时补） |
| §8 数据维护脚本 | Backlog（Plan B 或单独脚本） |

**类型一致性**：`CostMap`、`Stock`、`OperatorPlan`、`WeaponPlan`、`MaterialId` 在 planner / stock / store 三处使用一致。

**Placeholder 扫描**：无 TBD/TODO；数据 port 任务在 Task 4/5/6 明确指向 `reference/zmdgraph/js/data.js` 并要求一一对应。

---

## Plan B 预告（本 plan 完成后再写）

- Scaffold backend（FastAPI + venv + requirements）
- 预处理 + 网格检测 pipeline
- 模板匹配 + PaddleOCR 封装
- `/recognize/inventory` endpoint + fixture tests
- `/recognize/operators` endpoint
- 前端截图上传页 + 识别结果编辑/合并 UI
- 从 MaaEnd 复制图标素材（含许可证核对）
- `start.sh` 一键启动前后端
- 搜索终末地 datamine repo（执行阶段 TODO）
