# ZMD Backend

截图识别后端。提供 `/recognize/inventory` 和 `/recognize/operators` 两个 endpoint。

## 启动

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --port 8000 --reload
```

访问 `http://localhost:8000/docs` 看自动生成的 OpenAPI 文档。

## 测试

```bash
pytest -v
```

## OCR 引擎

本项目使用 `rapidocr-onnxruntime`（PaddleOCR 模型 + ONNX Runtime 推理）。
PaddlePaddle 不支持 Python 3.14 / Apple Silicon 的组合，因此使用 rapidocr 作为替代。
首次运行时 rapidocr 会自动下载 ONNX 模型文件（~50MB），请保证网络畅通。

## 首次安装

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 素材资源 (app/assets/)

`app/assets/materials/*.png` 和 `app/assets/operators/*.png` 由以下脚本生成：

```bash
python3 scripts/import-maa-icons.py
```

### 来源与许可

- **图标来源**：`reference/zmdgraph/images/icons/`（材料图标）和 `reference/zmdgraph/images/avatars/`（干员头像），均来自 `reference/zmdgraph`（终末地养成规划计算器，项目内参考数据）。该仓库无独立 LICENSE 文件。
- **MaaEnd**（`reference/MaaEnd/`）：AGPL-3.0 许可，用于了解游戏识别逻辑参考；其仓库中不含单独的物品图标 PNG，识别依赖 OCR 和 class ID，故未从中复制图片资产。
- **映射文件**：`app/assets/materials.json` 和 `app/assets/operators.json` 由同一脚本自动生成，格式为 `{ "材料名": "materials/mat_NNN.png" }`。
