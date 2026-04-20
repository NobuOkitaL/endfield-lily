# Changelog

本地养成规划器从 scaffold 到"总控核心 Lily"的演进记录。按主题分段（不是严格时间线），commit sha 只标关键节点。

## 2026-04-20（晚些时候）· 识别管线总大修 + 标注工具成型

前一轮把框架搭起来了（pixelmatch 算法 + 三个端点 + label-tool scaffold），但真跑真截图，识别仍然一塌糊涂：三档作战记录塌成一坨、干员 Lv 被 Otsu 截掉、单数字永远识别不到、模板归一化居然是不对称的…… 一次把级联 bug 全拔掉，现在识别（对已标注资产）真能用了。

### Template matching（`template_match.py`）

- **对称归一化**：老代码 `_normalize_thumbnail` 对模板做了中央 84% 裁剪、对 query 没做 —— 模板相对流水线格子被放大了，精细特征永远错位。去掉 `is_template` 参数 + `_TEMPLATE_OUTER_FRAME_CROP` 常量，两边走一样的流程
- **per-pixel 阈值 0.2 → 0.05**（L1 从 153 → 38）。depot-recognition 默认的 0.2 会把三档作战记录（初级/中级/高级，只差 ~20-30/channel 的色相）直接当 0 差；0.05 保住这种细微色差

### Color pipeline（`preprocess.py`）

- `load_and_normalize` 返回 **BGR 3 通道**（原先灰度）。同形状不同 tint 的卡（例如三档 EXP）主要靠色相区分，灰度化之后区分不开
- 单通道输入自动通过复制升到 BGR
- 下游 `detect_slots` 内部再转灰度给 Otsu 用，对 caller 透明
- 测试断言从 shape `(1080, 1920)` → `(1080, 1920, 3)`

### Slot detection（`grid_detect.py`）

- **Otsu 方向自适应**：canvas mean > 145（干员 / 武器 roster 背景偏亮）就切 `THRESH_BINARY_INV`，让深色卡成为前景；否则走原路径。库存继续走原路径
- **长宽比放宽** `[0.8, 1.25]` → `[0.6, 1.5]`，容纳 ~0.74 的高干员 / 武器肖像卡，同时保留 ~1.0 的方形库存格
- **中位数 outlier 过滤**：slot 落在 `[0.6×, 1.4×] × 中位数` 外面就丢或拆。合并在一起的 supercell（Otsu 把两张卡糊成一个 blob）按中位数尺寸拆成子 bbox，和已保留的 slot 去重
- 新 helper `p75_height(slots)` 返回高度 75 分位数。`operators.py` / `weapons.py` 用它**把等级 OCR 区向下延伸**—— Otsu 有时会在卡片肖像 / 稀有度条交界处截断，把 "Lv.XX" 裁掉。模板匹配仍走原 bbox，保证已标注模板继续能对上

### OCR（`ocr.py`）

- 放宽 rapidocr detection 参数：`text_score=0.1, box_thresh=0.1, unclip_ratio=3.0`。默认值对孤立单数字太严了 —— 单独的 "1" / "5" 根本不会被识别成文字（engine 返回 None）。放宽之后单字能以 ~0.3-0.5 conf 出来
- `PARSEABLE_CONFIDENCE_FLOOR` 0.5 → 0.3，把这些单数字 detection 放进来。真正的安全网是 `parse_quantity_string` 的严格数字正则
- `ocr_digits` 偏好**含数字的 detection**（如 "90"）胜过纯 label（如 "LV."）。老实现是"最高 confidence 胜"，"LV." conf 往往比数字高，结果数字被丢掉。不用拼接方案（试过，库存会出 "20202"）
- `parse_quantity_string` 新 fallback：前导标点场景（`.80` → 80），救那些 OCR 把 "Lv.80" 切成 "LV" + ".80" 的情况

### Route pipelines（`inventory.py` / `operators.py` / `weapons.py`）

- **多裁剪 OCR**：底部 0.30 / 0.40 / 0.50 / 0.60 各试一次，取**解析出数字最多**的那次（同数按 conf 高胜）。没有通吃的比例：太紧会截掉尾数（`202` → `20`），太宽会把图标剪影也 OCR 掉
- `match_slot(..., threshold=0.0)` 总是填 best-guess，再在外层手动应用 0.80 阈值。未知格子不再默认掉成下拉第一项，而是预选 best-guess
- **强匹配（conf ≥ 0.80）+ OCR 失败** → 现在落 `items`（quantity/level=0，让用户手改），以前错误地落 `unknowns`。只有弱匹配才去 `unknowns`
- `UnknownSlot` / `UnknownOpSlot` / `UnknownWeaponSlot` 新增 `best_guess_quantity` / `best_guess_level`；前端 `InventoryResultEditor` 读这俩预填下拉。conf ≥ 0.8 默认选 best-guess，否则默认选新增的 "— 不导入 —"（跳过条目不会导入）

### Labeling tool（`label-tool/` + `dev.py`）

已经从 "能采就行" 长成一个可用的小工具：

- `DELETE /dev/{asset_type}/templates/{name}` — 删 PNG + 从 `{asset_type}.labeled.json` 摘名字，让误标可以撤
- `GET /dev/{asset_type}/templates/{name}/image` — FileResponse PNG 做预览
- UI 加"查看/管理已标注"折叠面板：缩略图网格 + 每条删除按钮
- `GET /dev/{asset_type}/names` 返回 `[{name, labeled}]`，下拉对已标注名字加 `（已标注）`后缀；工具栏显示 `总数 / 已标注` 计数
- `POST /dev/{asset_type}/save-templates` 现在跳过 tracker 里已存在的条目，返回 `{saved, skipped[]}`
- **Tracker 与 shipped mapping 分开**：`{asset_type}.labeled.json` 只记开发者采集状态，和 shipped 的 `name → file` 映射互不污染

### 顺手修的老 bug

- **干员头像一堆不对**：洛茜（1392×1392 全身立绘）、庄方宜（150×210）、汤汤（144×144）、大潘（120×117）—— 从 end.wiki `character-card-list` CDN 重新下 120×120 标准版。这些是之前 manual avatar fetch 漏掉的，scraper 本身不下图片
- `.gitignore` 补：`.specstory/`、`.claude/`、`*.log`、`.env.*`（带 `!.env.example` 逃生口）

### 已知限制

- 识别只对**已标注**资产起作用。未标注条目走 `unknowns` + best-guess 提示，用户手动确认。当前覆盖：材料 19/36（53%）/ 干员 9/26（35%）/ 武器 1/68（1%）
- 有些特别窄的图标（极小或极细长条）切格子仍会出问题
- 多图 merge 对数量字段取 `max`（没有"最近"概念，多张图同一材料以最大值为准）

### 测试计数

- 前端 **84 passing**（不变）
- 后端 **49 → 51**（+2 dev 删除模板测试）

## 2026-04-20（补丁）· 跨浏览器状态同步

之前规划数据只活在 `localStorage` 里，换浏览器 / 换机器要手动导出导入 JSON。补一条后端同步通道：

- 新端点 `GET /state` + `PUT /state`（`backend/app/routes/state.py`），持久化文件 `backend/app/data/state.json`（gitignored via `backend/app/data/`）
- 前端 `useBackendSync` hook：挂到 store 订阅上，store 有变化就 PUT；启动时先 GET 一次做 rehydrate。后端挂了就翻 `offline` 状态、localStorage 照常写；下次改动 + 后端恢复时自动续上
- 初版本来做了「设置 → 后端同步」开关（默认关闭），后来简化成**始终开启**：`Settings.syncToBackend` 字段连同 `setSyncToBackend` action 一起删掉，persist 版本 **4 → 5**，migration 顺手丢掉这个字段。设置页只留一条同步状态行，没开关
- 后端无状态的那条老承诺仍然成立 —— state.json 是**用户数据文件**，不是业务状态；删掉它后端照跑，只是同步文件重新从前端首次写入开始建

### 测试计数

- 前端 **84 passing**（不变）
- 后端 **51 → 55**（+4 `/state` 端点测试）

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
- **后端测试**：51 passing（pipeline unit + inventory/operators/weapons endpoints + dev-label endpoints 含删除）
- **TypeScript**：clean（tsc --noEmit）
- **页面**：首页 / 规划 / 库存 / 干员 / 武器 / 基质 / 识别 / 设置（8 个）
- **独立工具**：`label-tool/`（端口 5174，已有删除 / 预览 / 标注进度显示）
- **数据**：26 干员 / 68 武器 / 39 材料 / 486 行 DATABASE / 7 张能量淤积点
- **识别算法**：pixelmatch 风格 RGBA L1 diff，对称归一化，per-pixel 阈值 0.05，color BGR pipeline，自适应 Otsu，多裁剪 OCR（max-digits 启发式），best-guess 预填
- **标注进度**：材料 19/36 · 干员 9/26 · 武器 1/68
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
