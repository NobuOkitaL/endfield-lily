# 终末地养成规划器（自建复刻版）设计文档

- **日期**：2026-04-17
- **目标**：在本地跑一个属于自己的《明日方舟：终末地》养成规划器，支持从游戏截图自动识别库存和干员信息。
- **参考项目**：
  - [CaffuChin0/zmdgraph](https://github.com/CaffuChin0/zmdgraph) — 养成规划计算逻辑和游戏数据来源
  - [MaaEnd/MaaEnd](https://github.com/MaaEnd/MaaEnd) — 图标素材来源（不复用其自动化框架）

---

## 1. 范围与目标

### v1 范围
1. 复刻 zmdgraph 的核心规划功能：干员/武器培养表、批量添加、规划聚合、库存扣减、备份/导入、深色模式。
2. 新增**截图识别**模块：
   - **库存页截图** → 自动识别材料图标和数量，回填到库存。
   - **干员列表截图** → 自动识别干员、当前等级、突破阶段，填进干员管理。
3. 本地运行，不做服务器部署，不做账号/云同步。

### 非目标（v1 不做）
- 武器强化 OCR（留到 v2，用户手动填）
- 全自动化外挂（像 MaaEnd 那样接管游戏）
- 移动端适配（v1 只保证桌面浏览器）
- 手机拍屏识别（v1 只支持 PC 1080p 横屏原生截图）

### 成功标准
- `./start.sh` 一行命令能起前后端。
- 对一组 ≥10 张真实 1080p 库存截图（放在 `backend/tests/fixtures/`）的测试集：材料种类 top-1 命中率 ≥ 95%，数量识别要么完全准确，要么在低置信度时明确标记 `unknown`（而不是返回错误数字）。
- 规划计算结果与 zmdgraph 在同样输入下一致。

---

## 2. 架构

```
┌──────────────────────────────┐          ┌──────────────────────────────┐
│  前端 (Vite + React + TS)    │  HTTP    │  后端 (Python + FastAPI)     │
│  localhost:5173              │ ───────► │  localhost:8000              │
│                              │          │                              │
│  • 规划器 UI（复刻 zmdgraph）│          │  • /recognize/inventory      │
│  • 库存/干员管理              │          │  • /recognize/operators      │
│  • 截图上传 + 结果编辑        │          │  • OpenCV + PaddleOCR        │
│  • 数据持久化: localStorage  │  ◄─────  │  • 图标模板库                 │
│                              │   JSON   │  • 无状态                     │
└──────────────────────────────┘          └──────────────────────────────┘
```

**前后端分离理由**：
- 图像识别是独立演化的模块，将来换模型不影响前端。
- 后端完全无状态（无 DB，重启不丢数据），用户数据全在前端 `localStorage`。
- 前端将来要做静态托管也容易（把截图识别功能降级或保留后端可选）。

### 技术栈

| 层 | 选型 | 理由 |
|----|------|------|
| 前端框架 | React 18 + TypeScript | 生态大、hooks 适合有状态的截图交互、TS 防 ID 字符串打错 |
| 构建 | Vite | 零配置、快 |
| 样式 | Tailwind CSS | shadcn/ui 的依赖，utility-first 够用 |
| UI 组件 | shadcn/ui | 冷淡精致风格，组件源码直接进项目，改起来自由 |
| 状态管理 | Zustand + persist 中间件 | 轻量、自动同步 localStorage，比 Redux 合适 |
| 后端框架 | FastAPI | 异步、自动 OpenAPI 文档、Python 生态最省心 |
| CV | OpenCV（`opencv-python`） | 模板匹配标准库 |
| OCR | PaddleOCR（中文/数字模型） | 中文识别质量碾压 Tesseract |
| Python 版本 | 3.11+ | PaddleOCR 兼容性好 |
| Python 包管理 | uv 或 pip + venv | uv 更快，pip 兜底 |
| Node 版本 | 20+ | Vite 最低要求 |

---

## 3. 识别管线

### 3.1 `/recognize/inventory`（库存识别）

**输入**：multipart/form-data，字段 `image`，PNG/JPG 文件。
**输出**：
```json
{
  "items": [
    {
      "material_id": "exp_tier3",
      "material_name": "中级作战记录",
      "quantity": 245,
      "confidence": 0.92,
      "bbox": [120, 340, 96, 96]
    }
  ],
  "unknowns": [
    {
      "bbox": [680, 340, 96, 96],
      "icon_thumbnail_base64": "iVBORw0KG..."
    }
  ]
}
```

**管线**：

1. **预处理**：读取图片 → 灰度化 → 把输入等比缩放到 1080p 画布（1920×1080），让后续模板匹配对非 1080p 输入也基本能用。模板库本身存 1080p 下的像素尺寸，不做多尺度。
2. **网格检测**：OpenCV `Canny` + `findContours`，筛选近似等大正方形轮廓，推断网格行列。
   - 若规则网格检测失败（截图有弹窗遮挡等），回退到"滑窗扫描 + NMS"方案。
3. **逐 slot 处理**：
   - **图标区**：slot 上部约 70% 区域 → 对 `backend/app/assets/materials/` 下每个模板做 `cv2.matchTemplate(TM_CCOEFF_NORMED)` → 取最高得分。
     - 阈值 ≥ 0.85：认定为该材料。
     - 阈值 < 0.85：标记 `unknown`，返回 thumbnail 让前端人工确认。
   - **数量区**：slot 右下角约 30% 区域 → PaddleOCR（数字+英文模型） → 后处理识别 `9999+`、`1.2万`、带千分位逗号等格式。若 OCR 返回置信度 < 0.8 或后处理无法解析为合法数字，整个 slot 标记 `unknown`，不返回猜测值。
4. **返回结果**：按网格行列顺序返回，保留 `bbox` 和 `confidence` 供前端叠加显示。

### 3.2 `/recognize/operators`（干员识别）

**输入**：同上。
**输出**：
```json
{
  "operators": [
    {
      "operator_id": "angelina",
      "name": "安洁莉娜",
      "level": 45,
      "ascension": 1,
      "confidence": 0.91,
      "bbox": [...]
    }
  ],
  "unknowns": [...]
}
```

**管线**：
1. 卡片 bbox 检测（同库存网格思路）。
2. 头像模板匹配 → `operator_id`。
3. 等级数字 PaddleOCR。
4. 突破/潜能标记：星星或光环图标计数（模板匹配 + 计数）。

### 3.3 关键工程决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 识别方法 | 模板匹配 + OCR | 游戏素材是固定集合，像素完美匹配足够；训练 CNN 是过度工程 |
| 失败处理 | 返回 `unknown` 让用户确认，不强猜 | 规划器数字错一位就废，宁可多一步人工 |
| 测试方案 | 真实截图固化为 fixtures | 每次改识别逻辑跑一遍，防回归 |
| 分辨率支持 | v1 只支持 1080p 横屏 PC 原生截图 | 缩放/手机拍屏的鲁棒性延后做 |
| 缩放鲁棒性 | 预处理时按基准分辨率等比缩放 | 简化模板阈值调参 |

---

## 4. 数据模型（localStorage）

前端用 Zustand store 管理，`persist` 中间件自动同步 `localStorage`。**沿用 zmdgraph 的命名和结构以便复用其计算逻辑，但迁移到 TS 强类型。**

```ts
// src/store/types.ts

interface Stock {
  [material_id: string]: number;   // 材料 → 持有数量
}

interface OperatorPlan {
  operator_id: string;
  current: { level: number; ascension: number };
  target: { level: number; ascension: number };
}

interface WeaponPlan {
  weapon_id: string;
  current: { level: number; ascension: number };
  target: { level: number; ascension: number };
}

interface AppState {
  stock: Stock;
  ownedOperators: { [id: string]: { level: number; ascension: number } };
  operatorPlans: OperatorPlan[];
  weaponPlans: WeaponPlan[];
  settings: { darkMode: boolean };
}
```

游戏数据（材料定义、消耗表、干员/武器列表）打进 bundle，不放 `localStorage`：`src/data/materials.ts` 等。

---

## 5. 目录结构

```
ZMD/
├── frontend/                      # Vite + React + TS
│   ├── src/
│   │   ├── data/                  # 从 zmdgraph 移植的游戏数据
│   │   ├── logic/                 # planner.ts, stock.ts
│   │   ├── pages/                 # Planner / Stock / Operators / Recognize / Settings
│   │   ├── components/ui/         # shadcn/ui
│   │   ├── store/                 # Zustand + persist
│   │   └── api/                   # 后端 fetch 封装
│   ├── package.json
│   └── vite.config.ts
│
├── backend/                       # Python + FastAPI
│   ├── app/
│   │   ├── main.py
│   │   ├── routes/
│   │   │   ├── inventory.py
│   │   │   └── operators.py
│   │   ├── pipelines/
│   │   │   ├── preprocess.py
│   │   │   ├── grid_detect.py
│   │   │   ├── template_match.py
│   │   │   └── ocr.py
│   │   └── assets/
│   │       ├── materials/         # 从 MaaEnd 复制的 PNG
│   │       └── operators/
│   ├── tests/
│   │   ├── fixtures/
│   │   └── test_inventory.py
│   └── requirements.txt
│
├── scripts/
│   ├── sync-data.ts               # 从 zmdgraph 拉 data.js，生成 diff 审核
│   └── sync-icons.py              # 从 MaaEnd 拉图标
│
├── docs/superpowers/specs/
├── start.sh
└── README.md
```

---

## 6. 运行方式

### 前置依赖
- Node.js 20+
- Python 3.11+

### 启动

```bash
./start.sh
# 访问 http://localhost:5173
```

`start.sh` 行为：
1. 检测 `backend/.venv` 是否存在，不存在则 `python3 -m venv .venv && pip install -r requirements.txt`。
2. 检测 `frontend/node_modules` 是否存在，不存在则 `npm install`。
3. 并行启动 `uvicorn`（后端 8000）和 `vite`（前端 5173）。
4. `trap EXIT` 确保 Ctrl+C 能同时杀两个进程。

---

## 7. 测试策略

- **后端识别**：`tests/fixtures/` 放真实截图 + 预期 JSON，pytest 跑端到端。每个新 bug 加一张 fixture。
- **前端逻辑**：Vitest 对 `planner.ts`、`stock.ts` 这类纯函数做单测，输入输出与 zmdgraph 保持一致。
- **前端 UI**：v1 不做 E2E，人工测试 smoke 路径。

---

## 8. 游戏数据维护策略

终末地会持续更新，新增干员/武器/材料时我们需要跟进。

### 数据来源（优先级从高到低）

1. **zmdgraph 的 `data.js`**：原作者维护，每次游戏更新会同步。写 `scripts/sync-data.ts` 拉最新版生成 diff 给用户审核，而不是自动覆盖。
2. **MaaEnd 的 `assets/`**：新材料/干员图标的来源。写 `scripts/sync-icons.py` 拉最新图标。
3. **PRTS Wiki 终末地版块**：备用数据源，要爬的时候再爬。
4. **游戏 datamine repo**：[Backlog] 执行阶段搜索是否存在终末地社区拆包仓库（类似明日方舟的 `yuanyan3060/ArknightsGameResource`）。找到且维护活跃就接入，否则保留在 backlog。

### 许可证检查

执行阶段先确认 MaaEnd 的 LICENSE 是否允许复用其 `assets/`（预期是 MIT/LGPL 类，自用没问题）。如果协议不允许，改为从游戏 wiki 抓取或自己截图提取。

---

## 9. Backlog（v1 后做）

1. 武器强化等级 OCR。
2. 搜索并接入终末地 datamine repo（执行阶段先搜）。
3. 数据同步脚本（`sync-data.ts` / `sync-icons.py`）。
4. 手机拍屏识别（透视校正、多分辨率）。
5. 移动端响应式布局。
6. 识别结果的"多张截图合并"流程（库存多页时）。
7. Tauri 套壳做成桌面 App。

---

## 10. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 终末地 UI 改版导致模板匹配失效 | fixture 套件回归；失败时降级到 `unknown` 让用户手填，不强猜 |
| PaddleOCR 对游戏字体识别不稳 | v1 先跑，若误识别率高再考虑训练细分类器；用户在前端可修正 |
| PaddleOCR 首次下载模型很慢/需要网络 | README 写明；后端启动时预热一次 |
| MaaEnd 素材许可证问题 | 执行阶段先核对，不合适则自己截图建模板库 |
| zmdgraph 上游数据结构变化破坏同步脚本 | sync 脚本生成 diff 人工审核，不自动覆盖 |
| 1080p 以外分辨率识别失败 | v1 明确只支持 1080p，其他分辨率在 UI 上给出提示 |
