# 总控核心 Lily — 终末地养成规划器

> *FROM TERRA TO TALOS II*

《明日方舟：终末地》养成规划器。覆盖库存管理、干员/武器状态记录、多维度养成规划与材料汇算，并支持从游戏截图自动识别库存与干员信息。

**本地运行**：所有用户数据（库存、已持有干员、规划）仅存在浏览器 `localStorage`，跨浏览器迁移通过 "设置 → 导出 JSON"。

**技术栈**：React 19 + TypeScript 6 前端 + Python 后端（FastAPI + OpenCV + rapidocr-onnxruntime）。

## 启动

### 前置依赖

| 依赖 | 版本 |
|------|------|
| **Node.js** | 20+ ｜
| **pnpm** | 最新 ｜
| **Python** | 3.11+｜

首次运行时会：
- 创建 Python venv 并装依赖（~3-5 分钟，含 opencv-python / rapidocr-onnxruntime / numpy / fastapi 等）
- 跑 pnpm install（~1-2 分钟）
- 首次调用识别接口时自动下载 ONNX 模型（几十 MB，需要网络）

### 跨平台一条命令（推荐）

macOS / Linux / Windows **通用**：

```bash
node start.mjs
```

首次运行会自动建 venv + 装 Python 依赖 + `pnpm install`。跑起来后：
- 前端：http://localhost:5173
- 后端 OpenAPI：http://localhost:8000/docs
- 日志打了 `[backend]` / `[frontend]` 标签、按色区分
- Ctrl+C 同时结束两端

### 平台专属脚本（可选）

- **macOS / Linux**：`./start.sh`（首次要 `chmod +x start.sh`）
- **Windows PowerShell**：`.\start.ps1`
  - 如提示执行策略受限，先跑一次：`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

### 分模块启动（调试用）

跑前后端分开，方便看日志。

#### 前端（任意平台）

```bash
cd frontend
pnpm install
pnpm dev
```

#### 后端（macOS / Linux）

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

#### 后端（Windows PowerShell）

```powershell
cd backend
py -m venv .venv                    # 或 python -m venv .venv
.\.venv\Scripts\Activate.ps1        # 激活 venv
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

#### 后端（Windows CMD）

```cmd
cd backend
py -m venv .venv
.venv\Scripts\activate.bat
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## 功能

### 规划器（前端）

- **库存**：39 种材料逐项管理；3 种 EXP 虚拟材料（作战记录 / 认知载体 / 武器经验值）由对应卡片数量自动换算
- **干员**：26 位干员，每位 10 个成长维度（精英阶段、等级、装备适配、潜能、基建、信赖、4 个技能）。潜能为抽卡获取，仅记录不参与规划
- **武器**：68 把武器按 3-6 星分组，2 个成长维度（破限阶段、等级）
- **规划**：**每干员/武器一张 TODO 卡片**，紧凑行显示目标摘要，点击弹详情 dialog 一次性编辑所有成长维度。材料齐备时点"完成规划"自动扣库存 + 回写已持有状态
- **基质刷取**（`/farm`）：选一批目标武器 → 枚举 (能量淤积点 × 3 预刻主属性 × 锁定副词条/技能词) 组合，按"一次刷取能覆盖多少武器"降序给方案
- **备份**：导出 / 导入 JSON（跨浏览器迁移用）

### 截图识别（后端）

- **库存截图** → 自动识别材料与数量，低置信度条目交给用户手动确认
- **干员列表截图** → 自动识别干员与当前等级（其他成长维度仍需手动填）
- **武器列表截图** → 自动识别武器与当前等级（通过 `POST /recognize/weapons`，与干员识别同一套 pipeline）
- **多图上传 + 去重**：三种识别入口都支持一次拖多张图，后端串行处理（UI 显示 `PROCESSING 2/5...`），前端 `logic/recognition-merge.ts` 按 id 去重（材料/干员/武器），数值字段取 `max`，bbox 和置信度跟随置信度更高的那次观察
- **置信度分级**：OCR 置信度 ≥ 0.8 直接采信；0.5-0.8 之间仅在能 clean-parse 为合法数字时采信；< 0.5 标记 unknown
- **图标匹配**：pixelmatch 风格的 RGBA 每像素 L1 差值（从 `arkntools/depot-recognition` 移植，MIT），100×100 BGRA 缩略图；模板与待测图走同一条 `_normalize_thumbnail`（中央 84% 裁剪去掉外框、5×5 高斯模糊、白方块遮住右下数量区、圆形 alpha mask），置信度 = `1 - diff_ratio`，阈值 0.80
- **后端完全无状态**：所有用户数据存于浏览器 `localStorage`，后端重启不丢任何数据

#### 当前限制（模板）

识别 pipeline 本身已就绪，但**仓库内现在装的模板图是 end.wiki 的英雄渲染图**（3D 图标 + 透明背景），它们与游戏内真实格子截图的外观不是像素级对齐的，所以真实截图的置信度经常落在 0.36-0.44。要让识别真能用，得用下面的 **label-tool** 从真实游戏截图里重新采模板。

### 模板标注工具 · label-tool

`label-tool/` 是一个独立的 Vite + React + TS + Tailwind 小应用（无 shadcn、无路由），**不合进主前端**，用来从真实游戏截图里采集并保存模板图。

```bash
cd label-tool
pnpm install
pnpm dev          # http://localhost:5174
```

端口固定 `5174`（主前端 5173、后端 8000），`strictPort: true`。UX：选资产类型（材料 / 干员 / 武器）→ 上传游戏截图 → 每个检测到的格子显示裁剪图 + 候选名下拉 → 批量保存。后端接口走 `backend/app/routes/dev.py`（`POST /dev/{asset_type}/extract-slots` / `POST /dev/{asset_type}/save-templates` / `GET /dev/{asset_type}/names`，`asset_type ∈ {materials, operators, weapons}`），保存时会写 PNG 到 `backend/app/assets/{asset_type}/{name}.png` 并更新对应 JSON。

## 运行测试

前端（84 个单测：数据完整性 / 成本计算 / 库存逻辑 / Zustand store / 规划聚合 / 基质方案算法 / 识别结果合并去重）：

```bash
cd frontend && pnpm test
```

后端（45 个单测：pipeline 模块 + endpoint 集成 + 武器识别端点 + dev 标注端点）：

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
│   │   └── pages/         # 8 个页面：首页 / 规划 / 库存 / 干员 / 武器 / 基质 / 识别 / 设置
│   ├── scripts/
│   │   └── port-from-endwiki.mjs  # 数据 port 脚本（主）
│   └── .endwiki-cache/    # HTTP 缓存（gitignored）
├── backend/               # Python FastAPI 识别后端
│   ├── app/               # FastAPI 入口 + 路由（含 dev 标注接口）+ pipeline
│   │   └── assets/        # 识别用模板图（materials / operators / weapons）
│   └── tests/             # pytest 单测
├── label-tool/            # 独立的模板采集工具（Vite + React，端口 5174）
├── start.sh               # 一键启动前后端
└── docs/                  # spec / plan / 设计规范 / CHANGELOG
```

项目演进详情：见 [`docs/CHANGELOG.md`](docs/CHANGELOG.md)。

## 数据来源

- **游戏数据**（材料 / 干员 / 武器 / 升级成本表）：[end.wiki](https://end.wiki/zh-Hans/)
- **图片素材**（干员头像 / 武器图标 / 材料图标）：`cdn.end.wiki`
- **基质规划数据**（能量淤积点副/技能词池 + 武器理想词条）参考：[Arknights-yituliu/ef-frontend-v1](https://github.com/Arknights-yituliu/ef-frontend-v1)

游戏《明日方舟：终末地》由鹰角网络开发，本项目为自用本地工具，不隶属于任何官方或商业实体。
