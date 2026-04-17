# ZMD — 终末地养成规划器（本地版）

本地复刻 [CaffuChin0/zmdgraph](https://github.com/CaffuChin0/zmdgraph) 的《明日方舟：终末地》养成规划器，React + TypeScript 重写，数据从 zmdgraph 的 `data.js` 通过脚本自动 port。

**v1 状态**：前端规划器已完整可用。v2 计划加 Python 后端做截图自动识别（库存页 / 干员列表页 → 自动回填）。

## 启动

前置依赖：
- Node.js 20+
- pnpm（或 npm/yarn 也行，命令自行替换）

```bash
cd frontend
pnpm install    # 首次
pnpm dev
# 访问 http://localhost:5173
```

## 功能清单（v1）

- **库存**：39 种材料，手动输入持有量；3 种 EXP 虚拟材料（作战记录/认知载体/武器经验值）由对应卡片数量自动换算
- **干员**：25 位干员，每位 10 个成长维度（精英阶段、等级、装备适配、天赋、基建、信赖、4 个技能）
- **武器**：66 把武器，按 3-6 星分组，2 个成长维度（破限阶段、等级）
- **规划**：增删规划行（选择目标 + 升级项目 + 当前→目标），实时聚合消耗，和库存对比显示缺料；全部覆盖时一键完成（扣库存 + 回写已持有状态）
- **备份**：导出/导入 JSON（跨浏览器迁移用）
- **深色模式**

## 运行测试

```bash
cd frontend && pnpm test
```

当前 67 个单测覆盖：材料/干员/武器/DATABASE 数据完整性、成本计算（查表、连续级累加、EXP 换算、武器破限）、库存 merge/diff/deduct、Zustand store、规划聚合。

## 数据更新

所有游戏数据（`src/data/materials.ts` / `operators.ts` / `weapons.ts` / `database.ts`）由 `scripts/port-data.mjs` 从 `reference/zmdgraph/` 自动生成。

要同步上游更新：

```bash
cd reference/zmdgraph && git pull
cd ../../frontend
node scripts/port-data.mjs materials
node scripts/port-data.mjs operators
node scripts/port-data.mjs weapons
node scripts/port-data.mjs database
```

生成的文件会被 git diff 标记，人工审核后再 commit。

## 目录结构

```
ZMD/
├── frontend/              # Vite + React + TS 前端
│   ├── src/
│   │   ├── data/          # 自动 port 的游戏数据
│   │   ├── logic/         # 成本计算、库存逻辑、EXP 换算
│   │   ├── store/         # Zustand + localStorage persist
│   │   ├── components/    # UI 组件（按模块分）
│   │   └── pages/         # 6 个页面
│   └── scripts/
│       └── port-data.mjs  # 数据 port 脚本
├── reference/             # 上游参考（gitignored）
│   ├── zmdgraph/
│   └── MaaEnd/
└── docs/superpowers/      # spec 和 plan
```

## 技术栈

前端：Vite 8 + React 19 + TypeScript 6 + Tailwind 3 + shadcn/ui + Zustand 5 + React Router 7 + Vitest。

## 致谢

- 游戏数据 / 计算逻辑：[CaffuChin0/zmdgraph](https://github.com/CaffuChin0/zmdgraph)（MIT）
- v2 预计图标素材：[MaaEnd/MaaEnd](https://github.com/MaaEnd/MaaEnd)
- 社区 wiki（未来数据源候选）：[end.wiki](https://end.wiki/zh-Hans/strategies/)
