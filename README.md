# 总控核心 Lily — 终末地养成规划器

> *FROM TERRA TO TALOS II*

《明日方舟：终末地》养成规划器。覆盖库存管理、干员/武器状态记录、多维度养成规划与材料汇算，并支持从游戏截图自动识别库存与干员信息。

**本地运行**：所有用户数据（库存、已持有干员、规划）仅存在浏览器 `localStorage`，跨浏览器迁移通过 "设置 → 导出 JSON"。

**技术栈**：React 19 + TypeScript 6 前端 + Python 后端（FastAPI + OpenCV + rapidocr-onnxruntime）。游戏数据从 [end.wiki](https://end.wiki) 通过脚本自动抓取生成。

> **注**：仓库内部代码标识符保留 `ZMD` 缩写（本地目录名、localStorage key、workspace 等），仅用户可见的品牌面是 "总控核心 Lily"。

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

## 功能

### 规划器（前端）

- **库存**：39 种材料逐项管理；3 种 EXP 虚拟材料（作战记录/认知载体/武器经验值）由对应卡片数量自动换算
- **干员**：26 位干员，每位 10 个成长维度（精英阶段、等级、装备适配、天赋、基建、信赖、4 个技能）
- **武器**：68 把武器按 3-6 星分组，2 个成长维度（破限阶段、等级）
- **规划**：增删规划行，实时聚合总消耗，对比库存显示缺料；全部覆盖时一键完成（扣库存 + 回写已持有状态）
- **备份**：导出 / 导入 JSON（跨浏览器迁移用）

### 截图识别（后端）

- **库存截图** → 自动识别材料与数量，低置信度条目交给用户手动确认
- **干员列表截图** → 自动识别干员与当前等级（其他成长维度仍需手动填）
- **置信度分级**：OCR 置信度 ≥ 0.8 直接采信；0.5-0.8 之间仅在能 clean-parse 为合法数字时采信；< 0.5 标记 unknown
- **后端完全无状态**：所有用户数据存于浏览器 `localStorage`，后端重启不丢任何数据

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
endfield-lily/            # 仓库根（本地目录名历史原因仍是 ZMD/，不强求改）
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
├── start.sh               # 一键启动前后端
└── docs/                  # spec / plan / 设计规范
```

## 数据来源

- 游戏数据（材料 / 干员 / 武器 / 升级成本表）：[end.wiki](https://end.wiki/zh-Hans/)
- 图片素材（干员头像 / 武器图标 / 材料图标）：`cdn.end.wiki`，WebP 抓取后转 PNG
- 基质规划算法参考：[Arknights-yituliu/ef-frontend-v1](https://github.com/Arknights-yituliu/ef-frontend-v1)（GPL-3.0，仅复用游戏机制数据，算法与 UI 本项目独立重写）

游戏《明日方舟：终末地》由鹰角网络开发，本项目为自用本地工具，不隶属于任何官方或商业实体。
