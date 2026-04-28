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
pytest -v     # 55 个单测：pipeline 模块 + 三个 recognize endpoint + dev 标注端点（含删除）+ /state
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

`_get_engine(use_text_det: bool = True)` 维护两个 singleton：默认 **det engine**（detector CNN + recognizer）和 **no-det engine**（仅 recognizer，单调用 ~4ms vs ~100ms）。`ocr_digits(image, *, use_text_det=True)` 选择路径。

**库存识别走 hybrid 快路径**：Phase 1 跑 12 个 no-det 调用 + 严格证据门控（top value ≠ 0、distinct fracs 严格大于第二名、且 ≥3 distinct fracs OR ≥2 含至少一个 tight crop ≥0.60）；不通过则 Phase 2 fallback 到 det engine 含 distinct-frac 早停。端到端 **3-4× 提速**（IMG_9590 38s→10s，IMG_9592 42s→15s），0 质量回归。**weapons / operators / 折金票** 仍走 det 默认路径（未做 benchmark，保守不动）。

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

真游戏截图模板通过 `label-tool/`（端口 5174）采集。当前覆盖：材料 34/36 · 干员 26/26 · 武器 55/68。

详见 `../CLAUDE.md` 里 "Recognition algorithm" 一节了解当前的像素差 + 多裁剪 OCR + best-guess 预填管线。
