# 总控核心 Lily — 终末地养成规划器

> *FROM TERRA TO TALOS II*

《明日方舟：终末地》养成规划器。覆盖库存管理、干员/武器状态记录、多维度养成规划与材料汇算，并支持从游戏截图自动识别库存与干员信息。

**本地运行**：所有用户数据（库存、已持有干员、规划）仅存在浏览器 `localStorage`，跨浏览器迁移通过 "设置 → 导出 JSON"。

**技术栈**：React 19 + TypeScript 6 前端 + Python 后端（FastAPI + OpenCV + rapidocr-onnxruntime）。

## 启动

### 前置依赖

| 依赖 | 版本 |
|------|------|
| **Node.js** | 20+ 
| **pnpm** | 最新 
| **Python** | 3.11+

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
- **后端同步**（始终开启）：只要后端在跑，规划数据就会自动同步到 `backend/app/data/state.json`，跨浏览器共享，无需手动导入导出。后端离线时状态栏显示 `offline`，localStorage 继续工作；下次有改动且后端恢复时自动续传。设置页保留一条状态行用于观察同步状态，没有开关。

### 截图识别（后端）

- **库存截图** → 自动识别材料与数量，低置信度条目交给用户手动确认；三档 EXP 作战记录（初级 / 中级 / 高级）现在靠颜色区分而不会全部塌成同一个模板
- **干员列表截图** → 自动识别干员与当前等级；等级文字（`Lv.XX`）用多裁剪 OCR（底部 0.30 / 0.40 / 0.50 / 0.60 各试一次，取解析出数字最多的那次），能识别单独的 "1" / "5" 这类 OCR 默认丢掉的孤立单数字
- **武器列表截图** → 同一条干员 pipeline，`POST /recognize/weapons`
- **多图上传 + 去重**：三种识别入口都支持一次拖多张图，后端串行处理（UI 显示 `PROCESSING 2/5...`），前端 `logic/recognition-merge.ts` 按 id 去重（材料/干员/武器），数值字段取 `max`，bbox 和置信度跟随置信度更高的那次观察
- **置信度分级**：OCR 置信度 ≥ 0.8 直接采信；0.3-0.8 之间仅在能 clean-parse 为合法数字时采信；否则 unknown
- **图标匹配**：pixelmatch 风格的 RGBA 每像素 L1 差值（从 `arkntools/depot-recognition` 移植，MIT），100×100 BGRA 缩略图；模板与待测图走**对称的** `_normalize_thumbnail`（5×5 高斯模糊、右下数量区盖白方块、圆形 alpha mask），per-pixel 阈值 **0.05**（原 depot-recognition 默认 0.2 会把 3 档作战记录的色差当作 0 差），match 阈值 0.80
- **格子定位**：Otsu+contour 找前景（卡内物品剪影）；对低对比度截图（如武陵仓库双面板）追加 **edge-lattice augmentation**——用 Canny 边沿做 x/y 投影找格线周期，拟合等距序列恢复完整网格，仅当 lattice 比 baseline 多至少 10 个 cell 才换用
- **未知条目预填**：强模板匹配 + OCR 失败的格子落到 `items`（数量/等级=0，让用户手改）；弱匹配才落 `unknowns`，并附 `best_guess_*` 字段给前端下拉预选
- **后端完全无状态**：所有用户数据存于浏览器 `localStorage`，后端重启不丢任何数据

#### 识别模板标注进度

识别只对**已标注**的资产起作用。未标注条目会掉到 `unknowns` 带一个低置信度最佳猜测，用户手动确认。当前采集进度：

- **材料**：34 / 36 已标注（94%）
- **干员**：26 / 26 已标注（100%）
- **武器**：55 / 68 已标注（81%）

已标注列表见 `backend/app/assets/{materials,operators,weapons}.labeled.json`（与出货的 name→file 映射分开，只记开发者自采状态）。

### 模板标注工具 · label-tool

`label-tool/` 是一个独立的 Vite + React + TS + Tailwind 小应用（无 shadcn、无路由），**不合进主前端**，用来从真实游戏截图里采集并保存模板图。

```bash
cd label-tool
pnpm install
pnpm dev          # http://localhost:5174
```

端口固定 `5174`（主前端 5173、后端 8000），`strictPort: true`。顶部有两种模式：

- **自动提取**：批量 workflow。拖放多张截图到任意位置 → `POST /dev/{asset}/extract-slots` 切格子 → 每格选名 → 批量保存。候选下拉对**已标注**的名字加 `（已标注）`后缀，工具栏显示总数 / 已标注计数
- **手动标注**：单图 workflow。适合自动检测不给力的界面（武陵仓库双面板 / 低对比度顶排水晶卡等）。上传一张图 → 画 1:1 正方形框（支持移动、角 handle 缩放、`Delete` / `Backspace` 删除、`Escape` 取消选中）→ 进命名页（大缩略图 grid）→ 保存。前端 canvas 裁 100×100 PNG 再 POST，和 backend 的 `_normalize_thumbnail` 目标尺寸一致

"查看/管理已标注"折叠面板列出缩略图 + 单条删除按钮（误标可以撤）。两种模式共用后端接口（`backend/app/routes/dev.py`）：

- `POST /dev/{asset_type}/extract-slots` — 切格子返回 bbox + base64
- `POST /dev/{asset_type}/save-templates` — 写 PNG 到 `backend/app/assets/{asset_type}/{name}.png`，已存在于 tracker 的条目跳过（返回 `{saved, skipped[]}`）
- `GET /dev/{asset_type}/names` — 返回 `[{name, labeled}]`
- `GET /dev/{asset_type}/templates/{name}/image` — 预览已标注 PNG
- `DELETE /dev/{asset_type}/templates/{name}` — 删除 PNG 并从 tracker 移除

`asset_type ∈ {materials, operators, weapons}`。开发者采集状态单独存在 `backend/app/assets/{asset_type}.labeled.json`，与出货的 name→file 映射分开，不会污染 shipped data。

## 运行测试

前端（84 个单测：数据完整性 / 成本计算 / 库存逻辑 / Zustand store / 规划聚合 / 基质方案算法 / 识别结果合并去重）：

```bash
cd frontend && pnpm test
```

后端（55 个单测：pipeline 模块 + endpoint 集成 + 武器识别端点 + dev 标注端点含删除 + /state 跨浏览器同步）：

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
