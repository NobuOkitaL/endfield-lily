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
