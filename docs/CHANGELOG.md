# Changelog

本地养成规划器从 scaffold 到"总控核心 Lily"的演进记录。按主题分段（不是严格时间线），commit sha 只标关键节点。

## 2026-04-20 · 识别 pipeline 大修 + 武器识别 + label-tool

### 识别算法换成 pixelmatch 风格

原方案 `cv2.matchTemplate(TM_CCOEFF_NORMED)`（灰度 NCC）对真实截图很脆，改成从 `arkntools/depot-recognition`（MIT）移植过来的**按像素 RGBA L1 diff**，走 100×100 BGRA 缩略图。模板与 query 共用一条 `_normalize_thumbnail`：

- 中央 84% 裁剪（仅模板，剥外框）
- 5×5 高斯模糊
- 100×100 `INTER_CUBIC`
- 右下数量区（x=20, y=72, w=60, h=22）盖白方块
- 圆形 alpha mask

`match_slot` 返回 `confidence = 1 - diff_ratio`（higher-is-better 语义不变），默认阈值由 0.85 降到 **0.80**，相关单测跟着调。

**还没真正可用的前提**：仓库现在装的模板图是 end.wiki 的英雄渲染图（3D + 透明底），跟游戏内真实格子在像素层面就不对齐，真实截图置信度落在 0.36-0.44。算法没错——模板得从真游戏截图重采才有意义。这也是下面 label-tool 存在的理由。

`load_and_normalize` 目前仍先灰度化，长期得让整条 pipeline 走全色，先挂 backlog。

### 武器识别端点

- 新增 `POST /recognize/weapons`（上 70% 图标 + 下 30% OCR 等级，复用干员那条 pipeline）
- 前端：`recognizeWeapons()` API 函数 + `WeaponsResponse` / `WeaponItem` 类型 + `mergeWeaponsResponses` 合并函数 + 新的 `WeaponResultEditor` + `RecognizePage` 新段

### 多图上传 + 去重

- `UploadDropzone` 支持 `multiple`，回调签名 `onFile(File)` → `onFiles(File[])`，drop 时过滤非图片
- 新 `logic/recognition-merge.ts`：`mergeInventoryResponses` / `mergeOperatorsResponses` / `mergeWeaponsResponses`，按 id（material_id / operator_id / weapon_id）去重，值字段取 `max`（数量 / 等级 / 等级），bbox + 置信度跟更高那次观察走，unknowns 拼接
- `RecognizePage` 串行批处理并显示进度（`PROCESSING 2/5...`）

### 顺手修的老 bug（识别这摊一直半死不活的根因）

- 前端 multipart 字段名写的是 `file`，后端三个端点都要 `image` —— **三路识别调用全在 422**。改成 `image` 才通
- `POST /recognize/operators` 后端返回 `{operators, unknowns}`，前端类型期待 `{items, unknowns}` —— 即便 OCR 成功，前端拿到的也是空数组。后端改成返回 `items`

### 独立模板标注工具 `label-tool/`

独立的 Vite + React + TS + Tailwind 小应用（没 shadcn、没 router），**不合进主前端**（避免污染主 app 依赖 + 打包，而且它只给开发者用）。

- 端口固定 **5174**（主前端 5173、后端 8000），`strictPort: true`
- 零依赖 `frontend/`
- UX：选资产类型（材料 / 干员 / 武器）→ 上传游戏截图 → 每个检测到的格子显示裁剪图 + 候选名下拉 → 批量保存
- 后端 `backend/app/routes/dev.py`（注册到 `main.py`）：
  - `POST /dev/{asset_type}/extract-slots` 返回 slot bbox + base64 图标
  - `POST /dev/{asset_type}/save-templates` 写 PNG 到 `backend/app/assets/{asset_type}/{name}.png` + 更新对应 JSON
  - `GET /dev/{asset_type}/names` 返回该资产类型的合法名字列表
  - `asset_type ∈ {materials, operators, weapons}`
- CORS 加了 `:5174`
- 仓库里本来就有 3 个 dev 端点单测（router 从没注册过，一直在失败）—— 这次一并跑通

### 杂项 UI 修

- **StockGrid 改版**：从 "有边框的大卡 + 大输入框" 改成**紧凑圆形图标磁贴**（~64px 圆 + 下方输入 + 小号名称 caption），响应式最多到 xl 10 列，搜索框保留，EXP 虚拟材料展示信号黄只读数值（不可输入），鼠标悬浮时 ring 变信号黄
- **Nav 悬浮色**：侧栏 link hover 之前是军绿，改成和终末地主 accent 一致的**信号黄**；focus-visible 的浏览器默认蓝/紫 glow 去掉
- **CornerBrackets**：加 `offset` prop（默认 6px，让角标**外推**超出父元素，避免和圆角边框重叠），加 `size` prop；首页 hero 显式传 `offset={0}` 保留原贴边行为
- **.gitignore 收紧**：显式列 `.specstory/`（IDE 对话历史目录，一直 untracked）+ `.claude/`；`.env.local` → `.env.*` + `!.env.example` 逃生口；补 `*.log`

### 测试计数

- 前端 **77 → 84**（+5 合并测试 for inventory + operators，+2 weapons）
- 后端 **39 → 45**（+2 weapons endpoint，+3 dev endpoint + 1 其他）

## 2026-04-17 · v0.1 · Plan A（前端规划器）

17 个任务交付一个能用的前端规划器，数据源从 `CaffuChin0/zmdgraph` 的 `data.js` 机械化 port 而来。

- Vite 8 + React 19 + TS 6 + Tailwind 3 + shadcn/ui 脚手架
- Zustand 5 + localStorage persist 状态层
- 前端数据：25 干员、66 武器、39 材料、481 行升级成本表
- 计算逻辑：`calculateProjectMaterials`（operator-specific → generic → per-level fallback）+ `calculateLevelMaterials`（5 段精英带重叠累加）
- 6 个页面：首页 / 规划 / 库存 / 干员 / 武器 / 设置
- 测试：67 个（数据完整性 + 成本计算 + 库存逻辑 + Zustand store + 规划聚合）

## 2026-04-17 · v0.2 · Plan B（后端 + 截图识别）

12 个任务交付 Python 后端和前端识别页。

- **backend/** 新增：FastAPI + CORS + pytest
- OCR 栈：**rapidocr-onnxruntime**（Python 3.14 没有 PaddlePaddle wheel，用 plan 预案的 fallback）
- Pipeline 模块（全 TDD）：
  - `preprocess.py` — 输入灰度化 + 等比缩放到 1080p 画布
  - `grid_detect.py` — Otsu + 形态学闭运算 + contour 方形过滤检出 slot bbox
  - `template_match.py` — `TemplateLibrary` + `cv2.matchTemplate(TM_CCOEFF_NORMED)` + NCC 尺度不变性 tiebreaker（像素差 fallback）
  - `ocr.py` — 三段式置信度：≥0.8 直接采信 / 0.5–0.8 能 parse 成数字才采信 / <0.5 unknown
- Endpoints：
  - `POST /recognize/inventory` — 截图 → {items[], unknowns[]}
  - `POST /recognize/operators` — 截图 → {operators[], unknowns[]}
- `start.sh` 一键起前后端，首次自动建 venv + pnpm install
- 前端 `/recognize` 页：上传区 + 库存/干员两段识别结果编辑器 + "合并到数据" 按钮
- 合成测试图跑通 pipeline；真实截图 fixture 留 backlog

## 2026-04-17（同日 · 迁移）· 数据源换 end.wiki

发现 zmdgraph 只有 25 干员 / 66 武器（落后游戏版本），改 end.wiki 为唯一源。

- 新 scraper `scripts/port-from-endwiki.mjs`（894 行，cheerio HTML 解析 + `.endwiki-cache/` 本地缓存）
- 子命令：`operators` / `weapons` / `database` / `verify-materials` / `all`
- 扩展抓取：精0-4 等级表、精英阶段、装备适配、基建、信赖、技能 1→12（初版漏了级别 EXP 和精英阶段，补完）
- 数据规模：**26 干员**（+庄方宜）/ **68 武器**（+孤舟、雾中微光；重命名 2 件）/ **39 材料** / **486 行** DATABASE
- 修了 zmdgraph 老 bug：基建 0→1 折金票 1200 → 1600；汤汤技能 3 名字拼写
- 图片素材从 `cdn.end.wiki` 拉 WebP 转 PNG（Python Pillow via backend venv）
- README / CLAUDE.md / 审计文档 `docs/research/2026-04-17-data-source-audit.md` 全部更新

## UI 视觉大改：Verge → 总控核心 Lily

### 第一次（Verge 编辑杂志风）
- 色板：Jelly Mint `#3cffd0` + Verge Ultraviolet `#5200ff` 作为"警戒胶带"强调色
- 字体：Anton（display）+ Hanken Grotesk（body）+ JetBrains Mono（ALL-CAPS 标签）
- 设计规范落到 `docs/design/theverge.md`（改版前先做了调研文档）
- 规则：无 `box-shadow` / 无 gradient / 仅 1px 边框 / 圆角只能走 2·3·4·20·24·30·40px 标尺

### 第二次（官方终末地视觉）
- 参考 endfield.hypergryph.com 改色：
  - 画布 `#0a0a0a`（更深）
  - 主强调 → 警示黄 **Signal Yellow `#f5e000`**
  - 次强调 → 军绿 **Military `#8fd5b0`**
  - Destructive → 警戒红 **Alert `#ff4a3d`**
- 字体回归 Verge 栈（Anton + Hanken Grotesk + JetBrains Mono，用户偏好）
- HUD 装饰：`CornerBrackets` 组件（卡片四角 1px 白/40 包围角标）
- 玻璃拟态：对话框 `backdrop-blur-md` + 80% 不透明黑

### 品牌重塑
- **ZMD → 总控核心 Lily**
  - `总控核心` 警示黄 + `Lily` 白 Anton，同行 baseline 对齐，Lily 字号略小于中文
  - Tagline：**FROM TERRA TO TALOS II**（最终去掉中文版，只留英文 mono）
  - Kicker：`ARKNIGHTS: ENDFIELD` 头部灰色 + `CENTRAL CORE · 终末地前哨` 副 kicker
  - HomePage 右半做 2×2 导航卡四宫格，左半品牌展示
  - 底部状态 kicker：`总控核心 · V1.2.4` / `TALOS II UPLINK · ACTIVE`
- Nav 侧栏：`总控核心 Lily` 同行缩小版 + `CENTRAL CORE` mono 灰
- 浏览器 tab 标题：`总控核心Lily · 终末地养成规划器`

### GitHub repo 改名
- `NobuOkitaL/ZMD` → **`NobuOkitaL/endfield-lily`**
- 本地目录保留 ZMD（历史原因，不强行改）
- `gh repo rename endfield-lily` 完成，301 redirect 覆盖老 URL
- README 开头加了"内部代码标识符仍是 ZMD"说明，避免后续误清

## 规划页重构（card-per-operator TODO）

原设计是"一行 = 一个升级项目"，每个干员得填 10 行。用户反馈笨。

- Schema 从 `PlanRow[]`（扁平）换成 `OperatorGoal[]` + `WeaponGoal[]`（每目标一 goal，含完整 target state）
- Zustand persist version 2 → 3（老数据 wipe）
- 新 UI：
  - 紧凑行卡片（~64px 高）：头像 + 名字 + 一行目标摘要 + 右侧状态 kicker（`READY ✓` / `缺 X 项` / `NO CHANGE` / `[已禁用]`）
  - 点击卡片弹详情 dialog（10 维度 edit grid + 材料需求全列 + `[移除] [禁用] [完成规划]`）
- 新 cost 函数 `computeOperatorGoalCost(goal, current)` — 遍历 10 维度逐个累加
- 图标接入：规划卡片 + 详情 dialog 都用真实头像（之前是占位文字块，漏接）
- 天赋（实际是潜能）从规划里移除 —— 潜能靠抽卡信物获得，不能 farm；在干员页 label 改为"潜能"，字段名 `天赋` 保留（不破 localStorage）

## 基质刷取规划（/farm 新页）

参考 `Arknights-yituliu/ef-frontend-v1`（GPL-3.0）抓的游戏机制数据，算法独立重写。

- 数据：7 张 能量淤积点（每图 8 副词条 + 8 技能词固定池）+ 68 武器理想 3 词条映射
- 算法 `computeFarmPlans(selectedNames)`：枚举 (图 × C(5,3) 主属性 × 锁定副词条/技能词) 组合，按覆盖武器数排序，top 20
- UI 左栏武器类型 tab + 卡片选择；右栏方案列表（图名 + 3 预刻 chip + 锁定词条 chip + 覆盖武器头像 tooltip）
- Nav 加 `基质` 链接
- 8 个新单测
- README 致谢参考项目

## 图片素材接入

初版 UI 只显示文字，没接图。
- 39 material icons + 25 operator avatars + 66 weapon icons 拷到 `frontend/public/images/`（~14MB，130 文件）
- 库存页、干员页、武器页、规划页、规划详情 dialog 全部接通
- 端末地迁移后补抓了 3 张新图（庄方宜 / 孤舟 / 雾中微光），改名的 2 件也拉了新版（显锋 / O.B.J.迅极）

## 当前状态快照（2026-04-20）

- **repo**：`NobuOkitaL/endfield-lily`（本地目录仍 `ZMD/`）
- **前端测试**：84 passing
- **后端测试**：45 passing（pipeline unit + inventory/operators/weapons endpoints + dev-label endpoints）
- **TypeScript**：clean（tsc --noEmit）
- **页面**：首页 / 规划 / 库存 / 干员 / 武器 / 基质 / 识别 / 设置（8 个）
- **独立工具**：`label-tool/`（端口 5174，用于重采模板）
- **数据**：26 干员 / 68 武器 / 39 材料 / 486 行 DATABASE / 7 张能量淤积点
- **识别算法**：pixelmatch 风格 RGBA L1 diff（confidence = 1 - diff_ratio, 阈值 0.80）
- **字体**：Anton + Hanken Grotesk + JetBrains Mono
- **色板**：Signal Yellow + Military Green + Alert Red + Canvas `#0a0a0a`

## Backlog

- **用 label-tool 采一批真实截图模板**，再跑识别回归（这是当前识别"能不能实际用"的主要阻塞）
- `load_and_normalize` 改走全色（目前仍先灰度）
- 真实截图 fixture（库存 ≥10 张 / 干员列表 ≥5 张 / 武器列表 ≥5 张）做识别回归
- `基建` / `装备适配` / `信赖` 的 end.wiki 边界值回归（当前只做了 spot check）
- 能量淤积点图标 / 地图缩略图（目前方案卡片只有文字）
- 数据自动同步：定时 / 按需触发 `scripts/port-from-endwiki.mjs all` 并自动打 diff PR
- 移动端响应式（目前桌面优先）
- `settings.darkMode` + `toggleDarkMode` 是 vestigial 字段（Verge 改版后唯一 dark），下次动 store schema 时顺手清
