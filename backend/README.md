# ZMD Backend

截图识别后端 + 跨浏览器状态同步。FastAPI + OpenCV + rapidocr-onnxruntime。

## 启动

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --port 8000 --reload
```

访问 `http://localhost:8000/docs` 看自动生成的 OpenAPI 文档。一条命令同起前后端见仓库根的 `node start.mjs` / `./start.sh`。

## 测试

```bash
pytest -v     # 74 个单测：pipeline 模块 + 三个 recognize endpoint + dev 标注端点（含删除）+ /state
```

## 端点

### 识别

- `POST /recognize/inventory` — 库存截图 → `{items[], unknowns[]}`
- `POST /recognize/operators` — 干员列表截图 → `{items[], unknowns[]}`
- `POST /recognize/weapons` — 武器列表截图 → `{items[], unknowns[]}`

### 跨浏览器状态同步

- `GET /state` — 返回 `{data, updated_at}`（空时也 200）
- `PUT /state` — 原子写入 `backend/app/data/state.json`（gitignored）

### 模板标注（供 `label-tool/` 使用）

`asset_type ∈ {materials, operators, weapons}`：

- `POST /dev/{asset_type}/extract-slots` — 切格子返回 bbox + base64 图标
- `POST /dev/{asset_type}/save-templates` — 写 PNG 到 `app/assets/{asset_type}/{name}.png`
- `GET /dev/{asset_type}/names` — 返回 `[{name, labeled}]`
- `GET /dev/{asset_type}/templates/{name}/image` — 预览已标注 PNG
- `DELETE /dev/{asset_type}/templates/{name}` — 删除 PNG 并从 tracker 移除

## OCR 引擎

`rapidocr-onnxruntime`（PaddleOCR 模型 + ONNX Runtime 推理）。PaddlePaddle 不支持 Python 3.14，所以用 rapidocr 作为替代。首次运行时会自动下载 ONNX 模型文件（~50MB），需要网络。

detection 参数（`text_score=0.1, det_box_thresh=0.1, det_unclip_ratio=3.0`，配合 `det_model_path=None` 绕开 rapidocr 1.2.3 的 `UpdateParameters` KeyError）在 `RapidOCR(...)` **构造期**固定，让孤立单数字（"1" / "5"）能被识别到。

`_get_engine(...)` 按需维护四个 singleton：**no-det**（仅 recognizer）、**fast detector**（320px max-side）、**accurate detector**（320px min-side）和保底的 **legacy detector**（RapidOCR 原 736px min-side）。快速结果只有在不同裁剪比例得出相同合法数字时才会采信，孤立 `Lv.1` 等困难样本仍可逐级回退。

**三类识别统一走保守级联**：库存先 no-det，随后 fast → accurate → legacy；干员先 fast；武器先 no-det。每层都尽早做 distinct-crop 投票，只有不一致或无法解析时才进入下一层。顶部折金票也使用相同快路径。合成端到端基准中，4 格库存约 2.6s→0.8s、3 格干员约 1.0s→0.05s、3 格武器约 3.1s→0.14s；精确数量/等级（含 `Lv.1` / `Lv.90`）有回归断言。

识别路由是 FastAPI 同步 worker 路由，CPU 工作不会阻塞事件循环；默认同时只允许 1 个识别任务，避免 ONNX Runtime 自身多线程被上传突发放大。需要实验并发时可设置 `ZMD_RECOGNITION_CONCURRENCY`。

真实截图基准可附带 ground truth：

```bash
python scripts/benchmark_ocr.py --mode current \
  --ground-truth /path/to/expected.json screenshot.png
```

`expected.json` 以截图完整路径或 basename 为 key，value 是 `{material_id: quantity}`；输出包含逐图 accuracy / exact_match 和整体耗时摘要。

## 首次安装

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 识别素材资源（app/assets/）

- `app/assets/{materials,operators,weapons}.json` — shipped name → file 映射（包括从 end.wiki 渲染的基础素材）
- `app/assets/{materials,operators,weapons}.labeled.json` — 开发者用真游戏截图标注过的名字集合（与 shipped mapping 分开；`save-templates` 遇到 tracker 里已有的名字会 skip）
- `app/assets/{materials,operators,weapons}/*.png` — 实际的模板图文件

真游戏截图模板通过 `label-tool/`（端口 5174）采集。当前覆盖：材料 36/36 · 干员 26/26 · 武器 55/68（折金票计入材料但无 PNG 模板，走固定区域 OCR）。

详见 `../CLAUDE.md` 里 "Recognition algorithm" 一节了解当前的像素差 + 多裁剪 OCR + best-guess 预填管线。
