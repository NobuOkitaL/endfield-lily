# 总控核心 Lily — 终末地养成规划器

> *FROM TERRA TO TALOS II*

《明日方舟：终末地》养成规划器。覆盖库存管理、干员/武器状态记录、多维度养成规划与材料汇算，并支持从游戏截图自动识别库存与干员信息。

**本地运行**：所有用户数据（库存、已持有干员、规划）仅存在浏览器 `localStorage`，跨浏览器迁移通过 "设置 → 导出 JSON"。

**技术栈**：React 19 + TypeScript 6 前端 + Python 后端（FastAPI + OpenCV + rapidocr-onnxruntime）。游戏数据从 [end.wiki](https://end.wiki) 通过脚本自动抓取生成。

## 启动

### 前置依赖（所有平台）

| 依赖 | 版本 | 说明 |
|------|------|------|
| **Node.js** | 20+ | 装好后确认 `node --version` |
| **pnpm** | 最新 | `npm install -g pnpm` 或 `corepack enable` |
| **Python** | 3.11+（已测 3.14） | macOS 有自带 `python3`，Windows 勾选 "Add Python to PATH" |
| **Git** | 任意 | 克隆 repo 用 |

首次运行时会：
- 创建 Python venv 并装依赖（~3-5 分钟，含 opencv-python / rapidocr-onnxruntime / numpy / fastapi 等）
- 跑 pnpm install（~1-2 分钟）
- 首次调用识别接口时自动下载 ONNX 模型（几十 MB，需要网络）

### macOS / Linux

```bash
./start.sh
# 访问 http://localhost:5173（前端）+ http://localhost:8000/docs（后端 OpenAPI）
```

如果 `./start.sh` 报 "permission denied"：`chmod +x start.sh` 后再跑。

### Windows

**PowerShell**（推荐）：

```powershell
.\start.ps1
```

首次跑可能提示执行策略受限，打开 PowerShell 执行一次：

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

**或者在 Git Bash 里直接跑 `./start.sh`**（如果你装了 Git for Windows，一般自带 Git Bash，和 macOS 用法一样）。

Windows 常见坑：
- `python` 命令找不到 → 安装时没勾 "Add Python to PATH"，重装或手动加到系统 PATH
- `pnpm` 找不到 → 跑 `npm install -g pnpm`
- 端口 5173 / 8000 被占 → 先关掉占用的进程，或改 `start.ps1` / `frontend/vite.config.ts` 里的端口

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

### 故障排查

| 症状 | 原因 / 解决 |
|------|------------|
| `pnpm: command not found` | `npm install -g pnpm` 或启用 corepack：`corepack enable` |
| `python3: command not found`（Windows） | 用 `py` 或 `python`；或重装 Python 勾选 "Add to PATH" |
| `pip install` 卡在 `opencv-python` / `numpy` | 装包期间要下几十 MB wheel，确保网络；国内可配 `pip install -i https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt` |
| 识别接口第一次调用很慢 / 卡住 | rapidocr 首次要下 ONNX 模型文件（约 10-50MB），等它下完就好；需要能访问 github raw / huggingface mirror |
| 端口 5173 / 8000 被占 | `lsof -i :5173`（mac/linux）或 `netstat -ano \| findstr :5173`（Windows）找到占用进程杀掉 |
| 前端白屏 / 数据加载不出来 | 打开浏览器 DevTools 看 Console；大概率是 `localStorage` 里有老版 schema 残留，设置页导出 JSON 备份 → 浏览器清该站点 `localStorage` → 导入恢复 |
| Windows PowerShell 提示 "无法加载脚本" | 执行一次 `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| 识别页显示 "后端未连接" | `start.sh`/`start.ps1` 没把后端起起来，或后端启动报错；单独开终端跑"分模块启动 → 后端"的命令看具体错误 |

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
- **置信度分级**：OCR 置信度 ≥ 0.8 直接采信；0.5-0.8 之间仅在能 clean-parse 为合法数字时采信；< 0.5 标记 unknown
- **后端完全无状态**：所有用户数据存于浏览器 `localStorage`，后端重启不丢任何数据

## 运行测试

前端（77 个单测：数据完整性 / 成本计算 / 库存逻辑 / Zustand store / 规划聚合 / 基质方案算法）：

```bash
cd frontend && pnpm test
```

后端（39 个单测：pipeline 模块 + endpoint 集成）：

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
│   ├── app/               # FastAPI 入口 + 路由 + pipeline
│   └── tests/             # pytest 单测
├── start.sh               # 一键启动前后端
└── docs/                  # spec / plan / 设计规范 / CHANGELOG
```

项目演进详情：见 [`docs/CHANGELOG.md`](docs/CHANGELOG.md)。

## 数据来源

- **游戏数据**（材料 / 干员 / 武器 / 升级成本表）：[end.wiki](https://end.wiki/zh-Hans/)
- **图片素材**（干员头像 / 武器图标 / 材料图标）：`cdn.end.wiki`
- **基质规划数据**（能量淤积点副/技能词池 + 武器理想词条）参考：[Arknights-yituliu/ef-frontend-v1](https://github.com/Arknights-yituliu/ef-frontend-v1)

游戏《明日方舟：终末地》由鹰角网络开发，本项目为自用本地工具，不隶属于任何官方或商业实体。
