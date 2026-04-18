# ZMD — 终末地养成规划器（本地版）

本地复刻 [CaffuChin0/zmdgraph](https://github.com/CaffuChin0/zmdgraph) 的《明日方舟：终末地》养成规划器，React + TypeScript 重写，数据从 [end.wiki](https://end.wiki) 通过脚本自动 port。

**v1**：前端规划器已完整可用。**v2**：Python 后端截图识别（库存页 / 干员列表页 → 自动回填）。

## 启动

前置依赖：
- Node.js 20+ + pnpm
- Python 3.11+

一键启动（推荐）：

```bash
./start.sh
# 访问 http://localhost:5173（前端）+ http://localhost:8000（后端 API）
```

首次运行会自动创建 Python venv 并安装依赖（约 3-5 分钟）以及执行 pnpm install。第一次调用识别接口时会自动下载 ONNX 模型（小文件，自动处理）。

分模块启动（调试用）：

```bash
# 前端
cd frontend && pnpm install && pnpm dev

# 后端
cd backend && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## 功能清单

### v1（规划器）

- **库存**：39 种材料，手动输入持有量；3 种 EXP 虚拟材料由卡片数量自动换算
- **干员**：26 位干员，每位 10 个成长维度（精英阶段、等级、装备适配、天赋、基建、信赖、4 个技能）
- **武器**：68 把武器，按 3-6 星分组，2 个成长维度（破限阶段、等级）
- **规划**：增删规划行，实时聚合消耗，和库存对比显示缺料；全部覆盖时一键完成（扣库存 + 回写已持有状态）
- **备份**：导出/导入 JSON（跨浏览器迁移用）
- **深色模式**

### v2（截图识别）

- **库存截图** → 自动识别材料 + 数量。低置信度交给用户手动确认。
- **干员列表截图** → 自动识别干员 + 等级（v2 仅限等级；精英阶段/技能等其他维度手动填）。
- **识别置信度分级**：OCR 置信度 ≥ 0.8 直接采信；0.5-0.8 之间只有能 clean-parse 为合法数字时才采信；< 0.5 标记 unknown 交给用户。
- **后端完全无状态** — 重启不丢任何用户数据（数据都在浏览器 localStorage）。

## 运行测试

前端（67 个单测）：

```bash
cd frontend && pnpm test
```

后端（~40 个单测 + pipeline + endpoint 集成）：

```bash
cd backend && source .venv/bin/activate && pytest -v
```

## 数据更新

所有游戏数据（`src/data/materials.ts` / `operators.ts` / `weapons.ts` / `database.ts`）由 `scripts/port-from-endwiki.mjs` 从 [end.wiki](https://end.wiki) 自动抓取生成。HTTP 响应缓存在 `frontend/.endwiki-cache/`（gitignored）。

要同步上游更新：

```bash
cd frontend
node scripts/port-from-endwiki.mjs all
```

图片素材（干员头像、武器图标）从 `cdn.end.wiki` 下载 WebP 后转换为 PNG，存放在 `frontend/public/images/`。生成的文件会被 git diff 标记，人工审核后再 commit。

## 技术栈

前端：Vite 8 + React 19 + TypeScript 6 + Tailwind 3 + shadcn/ui + Zustand 5 + React Router 7 + Vitest。

后端：Python 3.11+ + FastAPI + uvicorn + OpenCV (opencv-python) + rapidocr-onnxruntime（PaddleOCR fallback）+ pytest。

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
│   ├── scripts/
│   │   └── port-from-endwiki.mjs  # 数据 port 脚本（主）
│   └── .endwiki-cache/    # HTTP 缓存（gitignored）
├── backend/               # Python FastAPI 识别后端
│   ├── app/               # FastAPI 入口 + 路由 + pipeline
│   └── tests/             # pytest 单测
├── reference/             # 上游参考（gitignored）
│   └── zmdgraph/          # 历史参考数据源
└── docs/superpowers/      # spec 和 plan
```

## 致谢

- 游戏数据 / 图片素材：[end.wiki](https://end.wiki/zh-Hans/)（主要数据源；图片从 `cdn.end.wiki` 下载 WebP 转 PNG）
- 初始灵感 / 计算逻辑参考：[CaffuChin0/zmdgraph](https://github.com/CaffuChin0/zmdgraph)（MIT）
