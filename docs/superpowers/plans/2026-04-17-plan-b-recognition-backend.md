# Plan B: 截图识别后端 + 前端上传 UI 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Plan A 的规划器基础上，加一个本地 Python 后端（FastAPI + OpenCV + PaddleOCR），从游戏截图自动识别库存和干员信息；前端加上传页，识别结果编辑后合并进 Zustand store。

**Architecture:** 独立 Python 后端进程（localhost:8000）。前端通过 fetch POST 截图到两个 endpoint：`/recognize/inventory`（库存截图 → 材料名 + 数量）和 `/recognize/operators`（干员列表截图 → 干员名 + 10 维状态）。管线：预处理 → 网格检测 → 模板匹配（图标 → 材料/干员 ID）+ PaddleOCR（数字）。置信度低的 slot 返回 `unknown`，让用户前端手动确认。后端完全无状态。

**Tech Stack:**
- Python 3.11+
- FastAPI + uvicorn（web 框架）
- OpenCV (opencv-python)（图像处理、模板匹配）
- PaddleOCR（中文/数字 OCR，比 Tesseract 准）
- pytest（测试）
- uv（Python 包管理，比 pip 快；pip + venv 兜底）

**Spec:** `docs/superpowers/specs/2026-04-17-zmd-planner-design.md`

**Plan A Status:** 17/17 tasks complete。前端规划器已经可以本地跑 (`pnpm dev`)，数据在 localStorage。67 单测通过。Verge 美术风格已应用。

---

## 上游资产速查

- **图标素材**：`reference/MaaEnd/`（已 clone）。其 `assets/` 下应有终末地材料图标 + 干员头像 PNG。Plan B 的 Task 2 会核对许可证 + 筛选需要的图标。
- **材料名字**：Plan A 已经把 39 种 `MATERIAL_COLUMNS` port 到 `frontend/src/data/materials.ts`，后端需要同名字符串匹配——通过 JSON 配置文件共享。
- **干员名字**：`frontend/src/data/operators.ts` 的 `CHARACTER_LIST`（25 人）。

---

## 目录结构（新增部分）

```
ZMD/
├── frontend/                 # Plan A（已完成）
├── backend/                  # 新增
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py           # FastAPI 入口 + CORS
│   │   ├── routes/
│   │   │   ├── __init__.py
│   │   │   ├── inventory.py  # /recognize/inventory
│   │   │   └── operators.py  # /recognize/operators
│   │   ├── pipelines/
│   │   │   ├── __init__.py
│   │   │   ├── preprocess.py # resize to 1080p、灰度化
│   │   │   ├── grid_detect.py # Canny + contours → slot bboxes
│   │   │   ├── template_match.py # cv2.matchTemplate 封装
│   │   │   └── ocr.py        # PaddleOCR 封装 + 数字解析
│   │   └── assets/
│   │       ├── materials/    # 材料图标 PNG（Task 2 拷贝进来）
│   │       ├── operators/    # 干员头像 PNG
│   │       └── materials.json # 图标文件名 → 材料名映射
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── fixtures/         # 测试用图片
│   │   ├── test_preprocess.py
│   │   ├── test_grid_detect.py
│   │   ├── test_template_match.py
│   │   ├── test_ocr.py
│   │   ├── test_inventory_endpoint.py
│   │   └── test_operators_endpoint.py
│   ├── pyproject.toml
│   ├── requirements.txt
│   └── README.md
├── scripts/
│   └── import-maa-icons.py   # 从 MaaEnd 拷图标到 backend/app/assets/
├── start.sh                  # 一键启动前后端
└── .env.example
```

前端新增：
```
frontend/src/
├── pages/
│   └── RecognizePage.tsx     # 上传 + 预览 + 编辑 + 合并
├── components/recognize/
│   ├── UploadDropzone.tsx
│   ├── InventoryResultEditor.tsx
│   └── OperatorResultEditor.tsx
├── api/
│   └── recognition.ts        # fetch 封装
```

---

## Task 1：后端 scaffold（FastAPI + pytest + uv）

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/requirements.txt`
- Create: `backend/app/__init__.py`
- Create: `backend/app/main.py`
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/test_health.py`
- Create: `backend/README.md`
- Modify: `.gitignore`（排除 `backend/.venv/` 和 `backend/.pytest_cache/`）

- [ ] **Step 1：在根 .gitignore 补充后端忽略项**

```bash
cd /Users/nobuokita/Desktop/ZMD
```

编辑 `.gitignore`，在 `# Dependencies` 段下确认有：

```
**/.venv/
__pycache__/
*.pyc
.pytest_cache/
```

（Plan A Task 1 已经加过部分；检查补齐。）

- [ ] **Step 2：创建 `backend/` 目录骨架**

```bash
mkdir -p backend/app/routes backend/app/pipelines backend/app/assets/materials backend/app/assets/operators backend/tests/fixtures
```

- [ ] **Step 3：写 `backend/pyproject.toml`**

```toml
[project]
name = "zmd-backend"
version = "0.1.0"
description = "终末地规划器后端：截图识别"
requires-python = ">=3.11"
dependencies = [
  "fastapi>=0.115,<1.0",
  "uvicorn[standard]>=0.30,<1.0",
  "python-multipart>=0.0.9",
  "opencv-python>=4.10",
  "numpy>=1.26",
  "paddleocr>=2.7",
  "paddlepaddle>=2.6",
  "pillow>=10.0",
]

[project.optional-dependencies]
dev = [
  "pytest>=8.0",
  "httpx>=0.27",  # FastAPI TestClient 依赖
]

[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = ["test_*.py"]
```

- [ ] **Step 4：写 `backend/requirements.txt`**（uv 用不了时的兜底）

```
fastapi>=0.115,<1.0
uvicorn[standard]>=0.30,<1.0
python-multipart>=0.0.9
opencv-python>=4.10
numpy>=1.26
paddleocr>=2.7
paddlepaddle>=2.6
pillow>=10.0
pytest>=8.0
httpx>=0.27
```

- [ ] **Step 5：创建 venv 并装依赖**

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
# ~3-5 分钟。PaddlePaddle 包较大
```

如果 `paddlepaddle` 在 M 系列 Mac 上装不下来（ARM 兼容性问题），fallback 到 **rapidocr-onnxruntime**（同样是 PaddleOCR 模型但用 ONNX runtime 跑，兼容性好）：

```bash
pip uninstall -y paddleocr paddlepaddle
pip install rapidocr-onnxruntime
```

**如果装包失败，标记 BLOCKED 报告，不要继续。**

- [ ] **Step 6：写 `backend/app/__init__.py` 和 `backend/app/main.py`**

`backend/app/__init__.py`：

```python
"""ZMD backend: screenshot recognition service."""
```

`backend/app/main.py`：

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="ZMD 终末地识别后端", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 7：写 `backend/tests/__init__.py`（空文件）和 `test_health.py`**

```python
# backend/tests/test_health.py
from fastapi.testclient import TestClient

from app.main import app


def test_health_returns_ok():
    client = TestClient(app)
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
```

- [ ] **Step 8：跑测试确认通过**

```bash
cd backend
source .venv/bin/activate
pytest -v
# 预期：1 passed
```

- [ ] **Step 9：写 `backend/README.md`**

```markdown
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

## 首次运行注意

PaddleOCR 首次会自动下载模型文件（~50MB），请保证网络畅通。
```

- [ ] **Step 10：启一下 uvicorn 做冒烟**

```bash
uvicorn app.main:app --port 8000 &
UVICORN_PID=$!
sleep 3
curl -s http://localhost:8000/health
# 应输出 {"status":"ok"}
kill $UVICORN_PID
```

- [ ] **Step 11：提交**

```bash
cd /Users/nobuokita/Desktop/ZMD
git add backend/ .gitignore
git commit -m "feat(backend): scaffold FastAPI + pytest with health endpoint"
```

---

## Task 2：导入 MaaEnd 图标 + 建立映射文件

**Files:**
- Create: `scripts/import-maa-icons.py`
- Create: `backend/app/assets/materials.json`（图标文件名 → 材料名映射）
- 拷贝：`backend/app/assets/materials/*.png`, `backend/app/assets/operators/*.png`

**关键**：先核对 MaaEnd 的 LICENSE，确认可复用。如果许可证不兼容，**标记 BLOCKED 报告**，转由用户自己截图建素材库。

- [ ] **Step 1：检查 MaaEnd 许可证**

```bash
cat reference/MaaEnd/LICENSE 2>/dev/null || cat reference/MaaEnd/LICENSE.md 2>/dev/null || echo "NO LICENSE FILE"
```

预期：MIT、LGPL、Apache 或类似宽松协议。如果是 GPL、AGPL、非商业许可，或找不到，**BLOCKED**。

- [ ] **Step 2：探索 MaaEnd 素材结构**

```bash
find reference/MaaEnd -type d -name "*icon*" -o -name "*material*" -o -name "*assets*" 2>/dev/null | head -20
find reference/MaaEnd -name "*.png" -type f | head -50
```

根据实际目录结构，调整后续脚本。

- [ ] **Step 3：写 `scripts/import-maa-icons.py`**

脚本职责：
1. 读 `frontend/src/data/materials.ts`（导出的 `MATERIAL_COLUMNS` 39 个名字）
2. 从 `reference/MaaEnd/` 找出文件名包含对应材料中文名的 PNG（或者根据 MaaEnd 自己的配置 JSON 建映射）
3. 拷贝到 `backend/app/assets/materials/<slug>.png`（slug 用英文化的 id，避免文件系统中文名问题）
4. 生成 `backend/app/assets/materials.json`：`{ "exp_t3": "中级作战记录", ... }` 或反向 `{ "中级作战记录": "assets/materials/exp_t3.png" }`
5. 同理处理 `CHARACTER_LIST` 的干员头像

**脚本模板**（需要根据实际 MaaEnd 结构调整）：

```python
#!/usr/bin/env python3
"""Import icons from reference/MaaEnd into backend assets."""
from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAA = ROOT / "reference" / "MaaEnd"
OUT_MATERIALS = ROOT / "backend" / "app" / "assets" / "materials"
OUT_OPERATORS = ROOT / "backend" / "app" / "assets" / "operators"

# 先读前端的 MATERIAL_COLUMNS
MAT_TS = ROOT / "frontend" / "src" / "data" / "materials.ts"
OP_TS = ROOT / "frontend" / "src" / "data" / "operators.ts"


def extract_list(ts_file: Path, const_name: str) -> list[str]:
    """Hacky extraction of a Chinese string array from a TS file."""
    text = ts_file.read_text(encoding="utf-8")
    m = re.search(rf"{const_name}\s*=\s*\[([^\]]+)\]", text)
    if not m:
        raise RuntimeError(f"{const_name} not found in {ts_file}")
    return re.findall(r'"([^"]+)"', m.group(1))


def slugify(name: str, idx: int) -> str:
    """Produce a filesystem-safe slug from a Chinese name."""
    # Fallback: use an index-based slug; map stored in JSON
    return f"mat_{idx:03d}"


def main() -> None:
    OUT_MATERIALS.mkdir(parents=True, exist_ok=True)
    OUT_OPERATORS.mkdir(parents=True, exist_ok=True)

    materials = extract_list(MAT_TS, "MATERIAL_COLUMNS")
    print(f"Found {len(materials)} materials")

    # Index all MaaEnd PNGs by filename and relative path
    all_pngs = list(MAA.rglob("*.png"))
    print(f"Scanning {len(all_pngs)} PNGs in MaaEnd")

    mapping: dict[str, str] = {}
    missing: list[str] = []
    for idx, name in enumerate(materials):
        matches = [p for p in all_pngs if name in p.name or name in p.parent.name]
        if not matches:
            missing.append(name)
            continue
        src = matches[0]
        slug = slugify(name, idx)
        dst = OUT_MATERIALS / f"{slug}.png"
        shutil.copy(src, dst)
        mapping[name] = f"materials/{slug}.png"

    (OUT_MATERIALS.parent / "materials.json").write_text(
        json.dumps(mapping, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Imported {len(mapping)} materials, missing {len(missing)}: {missing}")

    # Operators
    ops = extract_list(OP_TS, "CHARACTER_LIST")
    print(f"Found {len(ops)} operators")
    op_mapping: dict[str, str] = {}
    op_missing: list[str] = []
    for idx, name in enumerate(ops):
        matches = [p for p in all_pngs if name in p.name or name in p.parent.name]
        if not matches:
            op_missing.append(name)
            continue
        src = matches[0]
        slug = f"op_{idx:03d}"
        dst = OUT_OPERATORS / f"{slug}.png"
        shutil.copy(src, dst)
        op_mapping[name] = f"operators/{slug}.png"

    (OUT_OPERATORS.parent / "operators.json").write_text(
        json.dumps(op_mapping, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Imported {len(op_mapping)} operators, missing {len(op_missing)}: {op_missing}")


if __name__ == "__main__":
    main()
```

**注意**：真实的 MaaEnd 目录结构可能和这个模板不匹配。Task 2 的**第一件事是跑 Step 2 的 find 命令，核对真实结构，再调整脚本里的路径匹配规则**。

- [ ] **Step 4：运行脚本**

```bash
cd /Users/nobuokita/Desktop/ZMD
python3 scripts/import-maa-icons.py
```

预期输出类似：`Imported 35 materials, missing ['武器经验值', ...]`。EXP 虚拟材料没有图标是正常的，可以接受。`missing` 清单应 ≤ 8（39 减去 3 个 EXP 虚拟材料 = 36 上限；少几个非核心材料也接受）。

如果导入率 < 70%（即找到 < 27 个材料图标），说明 MaaEnd 目录结构和脚本假设不符——停下来调脚本。

- [ ] **Step 5：生成空映射文件保底**

如果 Task 2 Step 4 出现较多 missing，在 `backend/app/assets/materials.json` 中至少保证文件存在（可以是空对象 `{}`），让下游 Task 6 跑得起来。

- [ ] **Step 6：提交**

```bash
git add scripts/ backend/app/assets/
git commit -m "feat(assets): import MaaEnd material and operator icons"
```

- [ ] **Step 7：更新 `backend/README.md`**

```bash
cat >> backend/README.md << 'EOF'

## 素材

图标素材通过 `scripts/import-maa-icons.py` 从 [MaaEnd](https://github.com/MaaEnd/MaaEnd) 导入。许可证：见 MaaEnd 仓库。
映射文件：`app/assets/materials.json` 和 `app/assets/operators.json`。
EOF

git add backend/README.md
git commit -m "docs(backend): note MaaEnd asset source"
```

---

## Task 3：Preprocess 模块（TDD）

**Files:**
- Create: `backend/app/pipelines/__init__.py`
- Create: `backend/app/pipelines/preprocess.py`
- Create: `backend/tests/test_preprocess.py`

- [ ] **Step 1：失败测试**

`backend/tests/test_preprocess.py`：

```python
import numpy as np
import pytest
from app.pipelines.preprocess import load_and_normalize


def _make_rgb(w: int, h: int) -> np.ndarray:
    """Make a dummy RGB image."""
    img = np.zeros((h, w, 3), dtype=np.uint8)
    img[:, :, 1] = 100  # green tint
    return img


def test_normalize_to_1080p_canvas():
    src = _make_rgb(1920, 1080)
    canvas = load_and_normalize(src)
    assert canvas.shape == (1080, 1920)  # grayscale 2D
    assert canvas.dtype == np.uint8


def test_upscale_smaller_input():
    src = _make_rgb(960, 540)
    canvas = load_and_normalize(src)
    assert canvas.shape == (1080, 1920)


def test_downscale_larger_input():
    src = _make_rgb(3840, 2160)
    canvas = load_and_normalize(src)
    assert canvas.shape == (1080, 1920)


def test_non_16_9_input_returns_1080_height_preserving_aspect():
    # 2048×1536 (4:3) scaled keeping height=1080 → width=1440
    src = _make_rgb(2048, 1536)
    canvas = load_and_normalize(src)
    assert canvas.shape == (1080, 1440)
```

- [ ] **Step 2：运行确认失败**

```bash
cd backend && source .venv/bin/activate
pytest tests/test_preprocess.py -v
# FAIL - module not found
```

- [ ] **Step 3：实现 `app/pipelines/__init__.py`（空）和 `preprocess.py`**

```python
# backend/app/pipelines/preprocess.py
from __future__ import annotations

import cv2
import numpy as np

CANVAS_W = 1920
CANVAS_H = 1080


def load_and_normalize(img: np.ndarray) -> np.ndarray:
    """
    Normalize input image to a 1080p grayscale canvas.
    - Converts BGR/RGB to grayscale (OpenCV uses BGR by default).
    - Scales keeping aspect ratio so the result has height = 1080
      when the input is ≤16:9, otherwise width = 1920.
    """
    if img.ndim == 3:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    else:
        gray = img

    h, w = gray.shape
    # Decide scale: fit by height or width, keep aspect
    scale_by_h = CANVAS_H / h
    scale_by_w = CANVAS_W / w
    # Use the smaller scale to avoid cropping when aspect diverges from 16:9;
    # this matches the behavior of "fit inside canvas" sizing.
    scale = min(scale_by_h, scale_by_w)
    new_w = int(round(w * scale))
    new_h = int(round(h * scale))
    resized = cv2.resize(gray, (new_w, new_h), interpolation=cv2.INTER_AREA)

    # For exact 16:9 inputs this will be 1920x1080; for 4:3 inputs, 1440x1080.
    # Tests below assert the expected shapes.
    return resized
```

- [ ] **Step 4：通过**

```bash
pytest tests/test_preprocess.py -v
# 4 passed
```

- [ ] **Step 5：提交**

```bash
cd /Users/nobuokita/Desktop/ZMD
git add backend/
git commit -m "feat(backend): preprocess module (normalize to 1080p canvas)"
```

---

## Task 4：Grid Detection 模块（TDD）

**Files:**
- Create: `backend/app/pipelines/grid_detect.py`
- Create: `backend/tests/test_grid_detect.py`
- Create: `backend/tests/fixtures/synthetic_grid.py`（合成测试图生成器）

- [ ] **Step 1：写合成图生成器**

`backend/tests/fixtures/synthetic_grid.py`：

```python
"""Generate synthetic grid images for unit tests."""
from __future__ import annotations

import numpy as np


def make_grid(
    rows: int = 4,
    cols: int = 6,
    slot_size: int = 128,
    gap: int = 24,
    border: int = 40,
    canvas_color: int = 20,
    slot_color: int = 200,
) -> tuple[np.ndarray, list[tuple[int, int, int, int]]]:
    """
    Create a grayscale image with a regular grid of light-colored square slots
    on a dark canvas. Returns (image, bboxes) where bboxes are (x, y, w, h).
    """
    w = border * 2 + cols * slot_size + (cols - 1) * gap
    h = border * 2 + rows * slot_size + (rows - 1) * gap
    img = np.full((h, w), canvas_color, dtype=np.uint8)
    bboxes: list[tuple[int, int, int, int]] = []
    for r in range(rows):
        for c in range(cols):
            x = border + c * (slot_size + gap)
            y = border + r * (slot_size + gap)
            img[y : y + slot_size, x : x + slot_size] = slot_color
            bboxes.append((x, y, slot_size, slot_size))
    return img, bboxes
```

- [ ] **Step 2：失败测试**

`backend/tests/test_grid_detect.py`：

```python
from app.pipelines.grid_detect import detect_slots
from .fixtures.synthetic_grid import make_grid


def test_detects_all_slots_on_synthetic_grid():
    img, expected = make_grid(rows=4, cols=6)
    slots = detect_slots(img)
    assert len(slots) == 24


def test_slot_bboxes_approximately_match():
    img, expected = make_grid(rows=3, cols=5, slot_size=120, gap=20)
    slots = detect_slots(img)
    # Sort both by (y, x) for comparison
    got = sorted(slots, key=lambda b: (b[1], b[0]))
    want = sorted(expected, key=lambda b: (b[1], b[0]))
    assert len(got) == len(want)
    for g, w in zip(got, want, strict=True):
        # Allow ±4px tolerance on each edge for contour approximation
        assert abs(g[0] - w[0]) <= 4
        assert abs(g[1] - w[1]) <= 4
        assert abs(g[2] - w[2]) <= 6
        assert abs(g[3] - w[3]) <= 6


def test_returns_empty_on_blank_canvas():
    import numpy as np
    blank = np.full((500, 500), 30, dtype=np.uint8)
    assert detect_slots(blank) == []
```

- [ ] **Step 3：运行确认失败**

```bash
pytest tests/test_grid_detect.py -v
# FAIL
```

- [ ] **Step 4：实现 `grid_detect.py`**

```python
# backend/app/pipelines/grid_detect.py
from __future__ import annotations

import cv2
import numpy as np

# Aspect ratio tolerance: slots should be roughly square
_AR_MIN = 0.8
_AR_MAX = 1.25
_MIN_AREA = 40 * 40  # reject tiny contours
_MAX_AREA_RATIO = 0.25  # reject contours that span too much of the canvas

BBox = tuple[int, int, int, int]


def detect_slots(img: np.ndarray) -> list[BBox]:
    """
    Detect grid slots as roughly-square regions brighter than the canvas.
    Returns list of (x, y, w, h) in image coordinates.
    """
    if img.ndim == 3:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    else:
        gray = img
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    # Close small gaps so each slot is a single contour
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    closed = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    canvas_area = gray.shape[0] * gray.shape[1]
    slots: list[BBox] = []
    for cnt in contours:
        x, y, w, h = cv2.boundingRect(cnt)
        area = w * h
        if area < _MIN_AREA:
            continue
        if area > canvas_area * _MAX_AREA_RATIO:
            continue
        ar = w / h if h > 0 else 0
        if ar < _AR_MIN or ar > _AR_MAX:
            continue
        slots.append((x, y, w, h))
    return slots
```

- [ ] **Step 5：通过**

```bash
pytest tests/test_grid_detect.py -v
# 3 passed
```

- [ ] **Step 6：提交**

```bash
cd /Users/nobuokita/Desktop/ZMD
git add backend/
git commit -m "feat(backend): grid slot detection via contours + aspect filter"
```

---

## Task 5：PaddleOCR 包装 + 数字解析（TDD）

**Files:**
- Create: `backend/app/pipelines/ocr.py`
- Create: `backend/tests/test_ocr.py`

**注意**：PaddleOCR 首次运行会下载 ~50MB 模型。测试对真实 OCR 的期望要保守（接受 0.8+ 置信度），同时把"数字解析"逻辑单独拆出来纯函数化，独立测试。

- [ ] **Step 1：失败测试**

`backend/tests/test_ocr.py`：

```python
import pytest

from app.pipelines.ocr import parse_quantity_string


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("245", 245),
        ("1,234", 1234),
        ("9999+", 9999),  # "+" 表示封顶，我们按封顶值算
        ("1.2万", 12000),
        ("3万", 30000),
        ("", None),
        ("?abc", None),
    ],
)
def test_parse_quantity_string(raw, expected):
    assert parse_quantity_string(raw) == expected


def test_parse_low_confidence_returns_none():
    # For the wrapper: if confidence < 0.8, return None
    from app.pipelines.ocr import parse_ocr_result

    assert parse_ocr_result("123", 0.95) == 123
    assert parse_ocr_result("123", 0.6) is None
```

- [ ] **Step 2：运行确认失败**

```bash
pytest tests/test_ocr.py -v
# FAIL
```

- [ ] **Step 3：实现 `ocr.py`**

```python
# backend/app/pipelines/ocr.py
from __future__ import annotations

import re

_CONFIDENCE_THRESHOLD = 0.8


def parse_quantity_string(raw: str) -> int | None:
    """
    Parse an OCR-read quantity string into an int.
    Returns None if the string can't be interpreted as a legal quantity.
    """
    if not raw:
        return None
    s = raw.strip().replace(",", "").replace(" ", "")
    if not s:
        return None
    # "9999+" → 9999 (cap indicator)
    if s.endswith("+"):
        s = s[:-1]
    # "1.2万" / "3万"
    m = re.fullmatch(r"(\d+(?:\.\d+)?)万", s)
    if m:
        try:
            return int(round(float(m.group(1)) * 10000))
        except ValueError:
            return None
    # Plain integer
    if s.isdigit():
        return int(s)
    # Decimal number → treat as int via round
    try:
        return int(round(float(s)))
    except ValueError:
        return None


def parse_ocr_result(raw: str, confidence: float) -> int | None:
    """
    Wrapper: low confidence or unparseable → None.
    """
    if confidence < _CONFIDENCE_THRESHOLD:
        return None
    return parse_quantity_string(raw)


# PaddleOCR / rapidocr runtime wrapper --------------------------------
# We import lazily so tests of parse_* functions don't trigger model loads.

_ocr_engine = None


def _get_engine():
    """Lazy-init the OCR engine. Tries PaddleOCR first, falls back to rapidocr."""
    global _ocr_engine
    if _ocr_engine is not None:
        return _ocr_engine
    try:
        from paddleocr import PaddleOCR

        _ocr_engine = ("paddle", PaddleOCR(use_angle_cls=False, lang="ch", show_log=False))
    except Exception:
        from rapidocr_onnxruntime import RapidOCR  # type: ignore

        _ocr_engine = ("rapid", RapidOCR())
    return _ocr_engine


def ocr_digits(image) -> tuple[str, float]:
    """
    Run OCR on a small image region expected to contain digits.
    Returns (best_text, confidence). If nothing is detected, returns ("", 0.0).
    """
    kind, engine = _get_engine()
    if kind == "paddle":
        result = engine.ocr(image, cls=False)
        # PaddleOCR returns nested structure; pick the highest-confidence line
        if not result or not result[0]:
            return ("", 0.0)
        best = max(result[0], key=lambda r: r[1][1])
        return (best[1][0], float(best[1][1]))
    else:
        # rapidocr: returns (result, elapse); result is list of (box, text, conf)
        result, _ = engine(image)
        if not result:
            return ("", 0.0)
        best = max(result, key=lambda r: r[2])
        return (best[1], float(best[2]))
```

- [ ] **Step 4：通过**

```bash
pytest tests/test_ocr.py -v
# 8 passed (7 parse_quantity + 1 parse_ocr_result combined via parametrize)
```

- [ ] **Step 5：提交**

```bash
cd /Users/nobuokita/Desktop/ZMD
git add backend/
git commit -m "feat(backend): OCR wrapper with quantity string parsing"
```

---

## Task 6：Template Matching 模块（TDD）

**Files:**
- Create: `backend/app/pipelines/template_match.py`
- Create: `backend/tests/test_template_match.py`

- [ ] **Step 1：失败测试**

`backend/tests/test_template_match.py`：

```python
import numpy as np

from app.pipelines.template_match import TemplateLibrary, match_slot


def _make_template(size: int = 96, intensity: int = 180) -> np.ndarray:
    img = np.zeros((size, size), dtype=np.uint8)
    img[10:-10, 10:-10] = intensity
    return img


def _make_slot_with_template(template: np.ndarray, pad: int = 20, bg: int = 30) -> np.ndarray:
    """Embed template inside a larger slot region with canvas padding."""
    h, w = template.shape
    slot = np.full((h + pad * 2, w + pad * 2), bg, dtype=np.uint8)
    slot[pad : pad + h, pad : pad + w] = template
    return slot


def test_match_slot_identifies_correct_template():
    # Build a library of 3 distinct templates
    t1 = _make_template(intensity=180)
    t2 = _make_template(intensity=120)
    t3 = np.zeros((96, 96), dtype=np.uint8)
    t3[::8, :] = 255  # striped pattern

    lib = TemplateLibrary({"mat_a": t1, "mat_b": t2, "mat_c": t3})

    slot = _make_slot_with_template(t1)
    result = match_slot(slot, lib, threshold=0.8)
    assert result.material_id == "mat_a"
    assert result.confidence >= 0.8


def test_low_confidence_returns_unknown():
    t1 = _make_template(intensity=180)
    lib = TemplateLibrary({"mat_a": t1})

    # Random noise slot → should not match
    rng = np.random.default_rng(42)
    slot = rng.integers(0, 256, size=(140, 140), dtype=np.uint8)
    result = match_slot(slot, lib, threshold=0.8)
    assert result.material_id is None
    assert result.confidence < 0.8


def test_empty_library_returns_unknown():
    lib = TemplateLibrary({})
    slot = np.zeros((100, 100), dtype=np.uint8)
    result = match_slot(slot, lib, threshold=0.8)
    assert result.material_id is None
```

- [ ] **Step 2：运行失败**

```bash
pytest tests/test_template_match.py -v
# FAIL
```

- [ ] **Step 3：实现 `template_match.py`**

```python
# backend/app/pipelines/template_match.py
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np


@dataclass
class MatchResult:
    material_id: str | None
    confidence: float


class TemplateLibrary:
    """A dict-like store of id → grayscale template image."""

    def __init__(self, templates: dict[str, np.ndarray] | None = None):
        self._templates: dict[str, np.ndarray] = dict(templates or {})

    @classmethod
    def from_directory(cls, assets_dir: Path, mapping_file: Path) -> "TemplateLibrary":
        """Load templates from a directory using a JSON mapping {name: rel_path}."""
        mapping = json.loads(mapping_file.read_text(encoding="utf-8"))
        templates: dict[str, np.ndarray] = {}
        for name, rel in mapping.items():
            path = assets_dir.parent / rel  # rel is like "materials/xxx.png"
            img = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
            if img is None:
                continue
            templates[name] = img
        return cls(templates)

    def items(self):
        return self._templates.items()

    def __len__(self) -> int:
        return len(self._templates)


def match_slot(
    slot: np.ndarray,
    library: TemplateLibrary,
    threshold: float = 0.85,
) -> MatchResult:
    """
    Match a slot region against every template in the library.
    Returns the best match if its score ≥ threshold, otherwise unknown.
    """
    if len(library) == 0:
        return MatchResult(material_id=None, confidence=0.0)

    if slot.ndim == 3:
        slot = cv2.cvtColor(slot, cv2.COLOR_BGR2GRAY)

    best_id: str | None = None
    best_score: float = 0.0
    for name, tpl in library.items():
        # Skip templates larger than the slot in either dimension
        if tpl.shape[0] > slot.shape[0] or tpl.shape[1] > slot.shape[1]:
            # Resize the template down to fit
            scale = min(slot.shape[0] / tpl.shape[0], slot.shape[1] / tpl.shape[1]) * 0.9
            new_w = max(1, int(tpl.shape[1] * scale))
            new_h = max(1, int(tpl.shape[0] * scale))
            tpl = cv2.resize(tpl, (new_w, new_h), interpolation=cv2.INTER_AREA)
        res = cv2.matchTemplate(slot, tpl, cv2.TM_CCOEFF_NORMED)
        _, max_val, _, _ = cv2.minMaxLoc(res)
        if max_val > best_score:
            best_score = float(max_val)
            best_id = name

    if best_score >= threshold:
        return MatchResult(material_id=best_id, confidence=best_score)
    return MatchResult(material_id=None, confidence=best_score)
```

- [ ] **Step 4：通过**

```bash
pytest tests/test_template_match.py -v
# 3 passed
```

- [ ] **Step 5：提交**

```bash
cd /Users/nobuokita/Desktop/ZMD
git add backend/
git commit -m "feat(backend): template matching with TemplateLibrary"
```

---

## Task 7：`/recognize/inventory` endpoint + 集成测试

**Files:**
- Create: `backend/app/routes/__init__.py`
- Create: `backend/app/routes/inventory.py`
- Modify: `backend/app/main.py`（include_router）
- Create: `backend/tests/test_inventory_endpoint.py`
- Create: `backend/tests/fixtures/build_inventory_fixture.py`（合成测试截图生成器）

- [ ] **Step 1：写合成库存截图生成器**

`backend/tests/fixtures/build_inventory_fixture.py`：

```python
"""Build a synthetic inventory screenshot for integration tests."""
from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np


def build_inventory_image(
    templates: dict[str, np.ndarray],
    quantities: dict[str, int],
    rows: int = 3,
    cols: int = 5,
) -> tuple[np.ndarray, list[tuple[str, int, tuple[int, int, int, int]]]]:
    """
    Tile templates + rendered digits into a grid. Returns (image, ground_truth).
    ground_truth is [(name, quantity, bbox)].
    """
    slot_size = 200
    gap = 24
    border = 48
    w = border * 2 + cols * slot_size + (cols - 1) * gap
    h = border * 2 + rows * slot_size + (rows - 1) * gap
    img = np.full((h, w, 3), 30, dtype=np.uint8)

    gt = []
    names = list(templates.keys())[: rows * cols]
    for i, name in enumerate(names):
        r = i // cols
        c = i % cols
        x = border + c * (slot_size + gap)
        y = border + r * (slot_size + gap)
        # Slot background
        cv2.rectangle(img, (x, y), (x + slot_size, y + slot_size), (200, 200, 200), -1)
        # Paste template (scaled to fit upper 70%)
        tpl = templates[name]
        tpl_h = int(slot_size * 0.7)
        tpl_w = tpl_h
        tpl_rs = cv2.resize(tpl, (tpl_w, tpl_h))
        if tpl_rs.ndim == 2:
            tpl_rs = cv2.cvtColor(tpl_rs, cv2.COLOR_GRAY2BGR)
        img[y + 10 : y + 10 + tpl_h, x + (slot_size - tpl_w) // 2 : x + (slot_size - tpl_w) // 2 + tpl_w] = tpl_rs
        # Draw quantity in lower-right
        q = quantities.get(name, 0)
        text = str(q)
        cv2.putText(
            img,
            text,
            (x + slot_size - 80, y + slot_size - 12),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.9,
            (0, 0, 0),
            2,
            cv2.LINE_AA,
        )
        gt.append((name, q, (x, y, slot_size, slot_size)))
    return img, gt


if __name__ == "__main__":
    # Quick visual check
    templates = {
        f"mat_{i:03d}": np.full((96, 96), 100 + i * 10, dtype=np.uint8) for i in range(6)
    }
    img, gt = build_inventory_image(templates, {n: i + 1 for i, (n, _, _) in enumerate([(k, 0, None) for k in templates])})
    out = Path(__file__).parent / "synthetic_inventory.png"
    cv2.imwrite(str(out), img)
    print(f"Wrote {out} ({img.shape})")
```

- [ ] **Step 2：失败测试**

`backend/tests/test_inventory_endpoint.py`：

```python
import io

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app
from .fixtures.build_inventory_fixture import build_inventory_image


@pytest.fixture
def client():
    return TestClient(app)


def _png_bytes(img: np.ndarray) -> bytes:
    success, buf = cv2.imencode(".png", img)
    assert success
    return buf.tobytes()


def test_inventory_endpoint_returns_items_for_synthetic_screenshot(client, tmp_path, monkeypatch):
    """
    Feed a synthetic grid with known templates + quantities, expect at least
    80% of items recognised and quantities matched for recognised items.
    """
    # Build a library of 4 distinct templates
    templates = {
        "mat_aaa": np.full((96, 96), 60, dtype=np.uint8),
        "mat_bbb": np.full((96, 96), 120, dtype=np.uint8),
        "mat_ccc": np.full((96, 96), 180, dtype=np.uint8),
        "mat_ddd": np.full((96, 96), 240, dtype=np.uint8),
    }
    # Add a distinguishing pattern so template match can differentiate
    for i, (_, t) in enumerate(templates.items()):
        t[::(i + 2) * 2, :] = 0

    quantities = {"mat_aaa": 12, "mat_bbb": 345, "mat_ccc": 99, "mat_ddd": 7}
    img, gt = build_inventory_image(templates, quantities, rows=2, cols=2)

    # Inject library via override on the endpoint's dep
    from app.routes import inventory as inv_mod

    monkeypatch.setattr(inv_mod, "_load_library", lambda: (type("L", (), {
        "items": lambda self: templates.items(),
        "__len__": lambda self: len(templates),
    })(),))

    # Alternatively: write a tmp materials.json + assets dir. For simplicity we
    # override via monkeypatch.
    from app.pipelines.template_match import TemplateLibrary

    monkeypatch.setattr(inv_mod, "_load_library", lambda: TemplateLibrary(templates))

    resp = client.post(
        "/recognize/inventory",
        files={"image": ("screenshot.png", _png_bytes(img), "image/png")},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    # At least 3 of 4 items recognised
    assert len(data["items"]) >= 3
    # Every returned item has the required fields
    for item in data["items"]:
        assert "material_id" in item
        assert "quantity" in item or item.get("quantity") is None
        assert "confidence" in item
        assert "bbox" in item


def test_inventory_endpoint_rejects_non_image(client):
    resp = client.post(
        "/recognize/inventory",
        files={"image": ("not-an-image.txt", b"hello", "text/plain")},
    )
    # Either 400 or 422 is acceptable
    assert resp.status_code in (400, 415, 422)
```

- [ ] **Step 3：运行失败**

```bash
pytest tests/test_inventory_endpoint.py -v
# FAIL
```

- [ ] **Step 4：实现 `backend/app/routes/__init__.py`（空）**

- [ ] **Step 5：实现 `backend/app/routes/inventory.py`**

```python
# backend/app/routes/inventory.py
from __future__ import annotations

import io
import base64
from pathlib import Path

import cv2
import numpy as np
from fastapi import APIRouter, File, HTTPException, UploadFile
from PIL import Image

from app.pipelines.grid_detect import detect_slots
from app.pipelines.ocr import ocr_digits, parse_ocr_result
from app.pipelines.preprocess import load_and_normalize
from app.pipelines.template_match import TemplateLibrary, match_slot

router = APIRouter(prefix="/recognize", tags=["recognize"])


_ASSETS_DIR = Path(__file__).resolve().parent.parent / "assets"
_MATERIALS_JSON = _ASSETS_DIR / "materials.json"


def _load_library() -> TemplateLibrary:
    """Load the materials template library from disk. Overridable in tests."""
    if not _MATERIALS_JSON.exists():
        return TemplateLibrary({})
    return TemplateLibrary.from_directory(_ASSETS_DIR / "materials", _MATERIALS_JSON)


def _decode_upload(file_bytes: bytes) -> np.ndarray:
    """Decode image bytes to a BGR numpy array. Raises HTTPException on failure."""
    try:
        pil_img = Image.open(io.BytesIO(file_bytes))
        pil_img = pil_img.convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image: {e}")
    arr = np.array(pil_img)
    # PIL RGB → OpenCV BGR
    return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)


def _bbox_to_list(bbox: tuple[int, int, int, int]) -> list[int]:
    return list(bbox)


@router.post("/inventory")
async def recognize_inventory(image: UploadFile = File(...)):
    """
    Accept a screenshot of the inventory page.
    Return recognised items + unknowns.
    """
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=415, detail="Expected an image upload")

    raw = await image.read()
    bgr = _decode_upload(raw)
    canvas = load_and_normalize(bgr)
    slots = detect_slots(canvas)

    library = _load_library()
    items: list[dict] = []
    unknowns: list[dict] = []

    for bbox in slots:
        x, y, w, h = bbox
        # Upper 70% for icon, lower 30% for quantity digits
        icon_h = int(h * 0.7)
        icon = canvas[y : y + icon_h, x : x + w]
        quantity_region = canvas[y + icon_h : y + h, x : x + w]

        match = match_slot(icon, library, threshold=0.85)

        raw_text, conf = ocr_digits(quantity_region)
        quantity = parse_ocr_result(raw_text, conf)

        if match.material_id is None or quantity is None:
            # Encode a thumbnail of the slot for user confirmation
            _, buf = cv2.imencode(".png", canvas[y : y + h, x : x + w])
            thumb_b64 = base64.b64encode(buf.tobytes()).decode("ascii")
            unknowns.append(
                {
                    "bbox": _bbox_to_list(bbox),
                    "icon_thumbnail_base64": thumb_b64,
                    "best_guess_material_id": match.material_id,
                    "best_guess_confidence": match.confidence,
                    "raw_ocr_text": raw_text,
                }
            )
            continue

        items.append(
            {
                "material_id": match.material_id,
                "material_name": match.material_id,  # TODO: map slug → 中文 via materials.json reverse
                "quantity": quantity,
                "confidence": match.confidence,
                "bbox": _bbox_to_list(bbox),
            }
        )

    return {"items": items, "unknowns": unknowns}
```

- [ ] **Step 6：注册 router**

编辑 `backend/app/main.py`：

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import inventory

app = FastAPI(title="ZMD 终末地识别后端", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(inventory.router)


@app.get("/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 7：通过**

```bash
pytest tests/test_inventory_endpoint.py -v
# 2 passed
```

**注意**：PaddleOCR 首次加载时间 10-30 秒，测试会慢。这是正常的。

- [ ] **Step 8：提交**

```bash
cd /Users/nobuokita/Desktop/ZMD
git add backend/
git commit -m "feat(backend): /recognize/inventory endpoint + integration test"
```

---

## Task 8：`/recognize/operators` endpoint

**Files:**
- Create: `backend/app/routes/operators.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_operators_endpoint.py`

**Note**：干员识别比库存复杂——识别干员头像（模板匹配）+ 等级数字 OCR + 精英阶段/突破数（识别小图标计数或模板匹配）。v1 先**只做头像识别 + 等级 OCR**；精英阶段、技能等级等其他成长维度留给用户手动填。这样任务范围可控。

- [ ] **Step 1：失败测试**

`backend/tests/test_operators_endpoint.py`：

```python
import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.pipelines.template_match import TemplateLibrary


@pytest.fixture
def client():
    return TestClient(app)


def _png_bytes(img: np.ndarray) -> bytes:
    success, buf = cv2.imencode(".png", img)
    return buf.tobytes()


def _make_op_screenshot(portraits: dict[str, np.ndarray], levels: dict[str, int]) -> np.ndarray:
    """Synthesize a multi-card operator grid screenshot."""
    card_w = 240
    card_h = 320
    gap = 20
    border = 40
    names = list(portraits.keys())
    cols = min(3, len(names))
    rows = (len(names) + cols - 1) // cols
    w = border * 2 + cols * card_w + (cols - 1) * gap
    h = border * 2 + rows * card_h + (rows - 1) * gap
    img = np.full((h, w, 3), 30, dtype=np.uint8)
    for i, name in enumerate(names):
        r = i // cols
        c = i % cols
        x = border + c * (card_w + gap)
        y = border + r * (card_h + gap)
        cv2.rectangle(img, (x, y), (x + card_w, y + card_h), (200, 200, 200), -1)
        p = portraits[name]
        if p.ndim == 2:
            p = cv2.cvtColor(p, cv2.COLOR_GRAY2BGR)
        ph, pw = 180, 180
        pr = cv2.resize(p, (pw, ph))
        img[y + 10 : y + 10 + ph, x + (card_w - pw) // 2 : x + (card_w - pw) // 2 + pw] = pr
        # Level text in lower area
        cv2.putText(
            img,
            f"Lv.{levels[name]}",
            (x + 20, y + card_h - 20),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.9,
            (0, 0, 0),
            2,
            cv2.LINE_AA,
        )
    return img


def test_operators_endpoint_returns_recognised_ops(client, monkeypatch):
    portraits = {
        "op_000": np.full((120, 120), 60, dtype=np.uint8),
        "op_001": np.full((120, 120), 140, dtype=np.uint8),
        "op_002": np.full((120, 120), 220, dtype=np.uint8),
    }
    for i, (_, p) in enumerate(portraits.items()):
        p[::(i + 2) * 3, :] = 0

    levels = {"op_000": 30, "op_001": 45, "op_002": 60}
    img = _make_op_screenshot(portraits, levels)

    from app.routes import operators as op_mod

    monkeypatch.setattr(op_mod, "_load_library", lambda: TemplateLibrary(portraits))

    resp = client.post(
        "/recognize/operators",
        files={"image": ("op.png", _png_bytes(img), "image/png")},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "operators" in data
    assert len(data["operators"]) >= 2  # allow one to fail


def test_operators_endpoint_rejects_non_image(client):
    resp = client.post(
        "/recognize/operators",
        files={"image": ("x.txt", b"hi", "text/plain")},
    )
    assert resp.status_code in (400, 415, 422)
```

- [ ] **Step 2：运行失败**

```bash
pytest tests/test_operators_endpoint.py -v
# FAIL
```

- [ ] **Step 3：实现 `backend/app/routes/operators.py`**

```python
# backend/app/routes/operators.py
from __future__ import annotations

import base64
import io
from pathlib import Path

import cv2
import numpy as np
from fastapi import APIRouter, File, HTTPException, UploadFile
from PIL import Image

from app.pipelines.grid_detect import detect_slots
from app.pipelines.ocr import ocr_digits, parse_ocr_result
from app.pipelines.preprocess import load_and_normalize
from app.pipelines.template_match import TemplateLibrary, match_slot

router = APIRouter(prefix="/recognize", tags=["recognize"])

_ASSETS_DIR = Path(__file__).resolve().parent.parent / "assets"
_OPERATORS_JSON = _ASSETS_DIR / "operators.json"


def _load_library() -> TemplateLibrary:
    """Load operator portraits. Overridable in tests."""
    if not _OPERATORS_JSON.exists():
        return TemplateLibrary({})
    return TemplateLibrary.from_directory(_ASSETS_DIR / "operators", _OPERATORS_JSON)


def _decode_upload(file_bytes: bytes) -> np.ndarray:
    try:
        pil_img = Image.open(io.BytesIO(file_bytes)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image: {e}")
    arr = np.array(pil_img)
    return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)


@router.post("/operators")
async def recognize_operators(image: UploadFile = File(...)):
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=415, detail="Expected an image upload")

    raw = await image.read()
    bgr = _decode_upload(raw)
    canvas = load_and_normalize(bgr)
    slots = detect_slots(canvas)

    library = _load_library()
    operators: list[dict] = []
    unknowns: list[dict] = []

    for bbox in slots:
        x, y, w, h = bbox
        portrait_h = int(h * 0.7)
        portrait = canvas[y : y + portrait_h, x : x + w]
        level_region = canvas[y + portrait_h : y + h, x : x + w]

        match = match_slot(portrait, library, threshold=0.85)
        raw_text, conf = ocr_digits(level_region)
        # Strip "Lv." prefix if OCR includes it
        cleaned = raw_text.replace("Lv.", "").replace("Lv", "").strip()
        level = parse_ocr_result(cleaned, conf)

        if match.material_id is None or level is None:
            _, buf = cv2.imencode(".png", canvas[y : y + h, x : x + w])
            unknowns.append(
                {
                    "bbox": list(bbox),
                    "icon_thumbnail_base64": base64.b64encode(buf.tobytes()).decode("ascii"),
                    "best_guess_operator_id": match.material_id,
                    "best_guess_confidence": match.confidence,
                    "raw_ocr_text": raw_text,
                }
            )
            continue

        operators.append(
            {
                "operator_id": match.material_id,
                "name": match.material_id,
                "level": level,
                "confidence": match.confidence,
                "bbox": list(bbox),
            }
        )

    return {"operators": operators, "unknowns": unknowns}
```

- [ ] **Step 4：注册到 main.py**

```python
# backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import inventory, operators

app = FastAPI(title="ZMD 终末地识别后端", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(inventory.router)
app.include_router(operators.router)


@app.get("/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 5：通过**

```bash
pytest tests/test_operators_endpoint.py -v
# 2 passed
```

- [ ] **Step 6：提交**

```bash
cd /Users/nobuokita/Desktop/ZMD
git add backend/
git commit -m "feat(backend): /recognize/operators endpoint"
```

---

## Task 9：前端 API client

**Files:**
- Create: `frontend/src/api/recognition.ts`

- [ ] **Step 1：实现**

```ts
// frontend/src/api/recognition.ts
const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000';

export interface InventoryItem {
  material_id: string;
  material_name: string;
  quantity: number;
  confidence: number;
  bbox: [number, number, number, number];
}

export interface UnknownSlot {
  bbox: [number, number, number, number];
  icon_thumbnail_base64: string;
  best_guess_material_id: string | null;
  best_guess_confidence: number;
  raw_ocr_text: string;
}

export interface InventoryResponse {
  items: InventoryItem[];
  unknowns: UnknownSlot[];
}

export interface OperatorItem {
  operator_id: string;
  name: string;
  level: number;
  confidence: number;
  bbox: [number, number, number, number];
}

export interface UnknownOpSlot extends Omit<UnknownSlot, 'best_guess_material_id'> {
  best_guess_operator_id: string | null;
}

export interface OperatorsResponse {
  operators: OperatorItem[];
  unknowns: UnknownOpSlot[];
}

export async function recognizeInventory(file: File): Promise<InventoryResponse> {
  const form = new FormData();
  form.append('image', file);
  const resp = await fetch(`${API_BASE}/recognize/inventory`, {
    method: 'POST',
    body: form,
  });
  if (!resp.ok) throw new Error(`Inventory recognition failed: ${resp.status}`);
  return resp.json();
}

export async function recognizeOperators(file: File): Promise<OperatorsResponse> {
  const form = new FormData();
  form.append('image', file);
  const resp = await fetch(`${API_BASE}/recognize/operators`, {
    method: 'POST',
    body: form,
  });
  if (!resp.ok) throw new Error(`Operators recognition failed: ${resp.status}`);
  return resp.json();
}

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const resp = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(2000) });
    return resp.ok;
  } catch {
    return false;
  }
}
```

- [ ] **Step 2：验证**

```bash
cd /Users/nobuokita/Desktop/ZMD/frontend
npx tsc --noEmit
```

- [ ] **Step 3：提交**

```bash
cd /Users/nobuokita/Desktop/ZMD
git add frontend/
git commit -m "feat(frontend): recognition API client"
```

---

## Task 10：前端识别页 UI

**Files:**
- Create: `frontend/src/pages/RecognizePage.tsx`
- Create: `frontend/src/components/recognize/UploadDropzone.tsx`
- Create: `frontend/src/components/recognize/InventoryResultEditor.tsx`
- Create: `frontend/src/components/recognize/OperatorResultEditor.tsx`
- Modify: `frontend/src/App.tsx`（加路由）
- Modify: `frontend/src/components/layout/Nav.tsx`（加"识别"菜单）

- [ ] **Step 1：`UploadDropzone.tsx`**

```tsx
// frontend/src/components/recognize/UploadDropzone.tsx
import { useCallback, useState } from 'react';

interface Props {
  onFile: (file: File) => void;
  label: string;
}

export function UploadDropzone({ onFile, label }: Props) {
  const [drag, setDrag] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDrag(false);
      const f = e.dataTransfer.files?.[0];
      if (f && f.type.startsWith('image/')) onFile(f);
    },
    [onFile],
  );

  return (
    <label
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
      className={`block border-2 border-dashed ${drag ? 'border-mint bg-mint/5' : 'border-white/30'} rounded-card p-12 text-center cursor-pointer transition-colors`}
    >
      <input
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
      <div className="font-mono uppercase text-mint text-xs tracking-[0.15em]">{label}</div>
      <div className="mt-3 text-sm text-muted-foreground">拖图到这里 / 点击选择文件</div>
    </label>
  );
}
```

- [ ] **Step 2：`InventoryResultEditor.tsx`**

```tsx
// frontend/src/components/recognize/InventoryResultEditor.tsx
import { useState } from 'react';
import type { InventoryResponse } from '@/api/recognition';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAppStore } from '@/store/app-store';
import { MATERIAL_COLUMNS, type MaterialName } from '@/data/materials';

interface Props {
  result: InventoryResponse;
  onApplied: () => void;
}

export function InventoryResultEditor({ result, onApplied }: Props) {
  const replaceStock = useAppStore((s) => s.replaceStock);
  const currentStock = useAppStore((s) => s.stock);

  const [edits, setEdits] = useState<Record<string, number>>(() =>
    Object.fromEntries(result.items.map((i) => [i.material_id, i.quantity])),
  );
  const [unknownChoices, setUnknownChoices] = useState<Record<number, { name: string; qty: number }>>({});

  function applyAll() {
    const patch: Partial<Record<MaterialName, number>> = {};
    for (const [id, qty] of Object.entries(edits)) {
      patch[id as MaterialName] = qty;
    }
    for (const [idx, choice] of Object.entries(unknownChoices)) {
      if (choice.name && choice.qty >= 0) patch[choice.name as MaterialName] = choice.qty;
    }
    // Merge into existing stock (replace mode on the recognised keys only)
    const merged = { ...currentStock, ...patch };
    replaceStock(merged);
    onApplied();
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="font-mono uppercase text-mint text-xs tracking-[0.15em]">
          识别成功 · {result.items.length} 项
        </h3>
        <div className="space-y-2">
          {result.items.map((item) => (
            <div key={item.material_id} className="flex items-center gap-3 border border-white/20 rounded-card p-3">
              <div className="flex-1">
                <div className="font-medium">{item.material_name}</div>
                <div className="text-xs text-muted-foreground font-mono">置信度 {(item.confidence * 100).toFixed(0)}%</div>
              </div>
              <Input
                type="number"
                min={0}
                value={edits[item.material_id] ?? 0}
                onChange={(e) => setEdits((s) => ({ ...s, [item.material_id]: Math.max(0, Number(e.target.value) || 0) }))}
                className="w-28"
              />
            </div>
          ))}
        </div>
      </section>

      {result.unknowns.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-mono uppercase text-ultraviolet text-xs tracking-[0.15em]">
            需要确认 · {result.unknowns.length} 项
          </h3>
          <div className="space-y-2">
            {result.unknowns.map((u, idx) => {
              const choice = unknownChoices[idx] ?? { name: '', qty: 0 };
              return (
                <div key={idx} className="flex items-center gap-3 border border-ultraviolet/40 rounded-card p-3">
                  <img
                    src={`data:image/png;base64,${u.icon_thumbnail_base64}`}
                    alt="unknown icon"
                    className="w-16 h-16 rounded-sm border border-white/20"
                  />
                  <select
                    className="flex-1 border border-white/30 rounded-form bg-background px-2 py-1.5 text-sm"
                    value={choice.name}
                    onChange={(e) => setUnknownChoices((s) => ({ ...s, [idx]: { ...choice, name: e.target.value } }))}
                  >
                    <option value="">-- 选择材料 --</option>
                    {MATERIAL_COLUMNS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    min={0}
                    value={choice.qty}
                    onChange={(e) => setUnknownChoices((s) => ({ ...s, [idx]: { ...choice, qty: Math.max(0, Number(e.target.value) || 0) } }))}
                    className="w-28"
                  />
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="flex justify-end">
        <Button onClick={applyAll}>合并到库存</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3：`OperatorResultEditor.tsx`**

```tsx
// frontend/src/components/recognize/OperatorResultEditor.tsx
import { useState } from 'react';
import type { OperatorsResponse } from '@/api/recognition';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAppStore, type OperatorState } from '@/store/app-store';
import { CHARACTER_LIST } from '@/data/operators';

interface Props {
  result: OperatorsResponse;
  onApplied: () => void;
}

const DEFAULT_STATE: OperatorState = {
  精英阶段: 0, 等级: 1, 装备适配: 0, 天赋: 0, 基建: 0, 信赖: 0,
  技能1: 1, 技能2: 1, 技能3: 1, 技能4: 1,
};

export function OperatorResultEditor({ result, onApplied }: Props) {
  const setOwned = useAppStore((s) => s.setOwnedOperator);
  const ownedOps = useAppStore((s) => s.ownedOperators);

  const [edits, setEdits] = useState<Record<string, { name: string; level: number }>>(() =>
    Object.fromEntries(result.operators.map((o) => [o.operator_id, { name: o.name, level: o.level }])),
  );

  function applyAll() {
    for (const [id, v] of Object.entries(edits)) {
      if (!v.name) continue;
      const prev = ownedOps[v.name] ?? DEFAULT_STATE;
      setOwned(v.name, { ...prev, 等级: v.level });
    }
    onApplied();
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="font-mono uppercase text-mint text-xs tracking-[0.15em]">
          识别成功 · {result.operators.length} 位
        </h3>
        <div className="space-y-2">
          {result.operators.map((op) => {
            const edit = edits[op.operator_id];
            return (
              <div key={op.operator_id} className="flex items-center gap-3 border border-white/20 rounded-card p-3">
                <select
                  className="border border-white/30 rounded-form bg-background px-2 py-1.5 text-sm"
                  value={edit.name}
                  onChange={(e) => setEdits((s) => ({ ...s, [op.operator_id]: { ...edit, name: e.target.value } }))}
                >
                  <option value="">-- 选择干员 --</option>
                  {CHARACTER_LIST.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <Input
                  type="number"
                  min={1}
                  max={90}
                  value={edit.level}
                  onChange={(e) =>
                    setEdits((s) => ({ ...s, [op.operator_id]: { ...edit, level: Math.max(1, Math.min(90, Number(e.target.value) || 1)) } }))
                  }
                  className="w-24"
                />
                <span className="text-xs text-muted-foreground font-mono">{(op.confidence * 100).toFixed(0)}%</span>
              </div>
            );
          })}
        </div>
      </section>

      <div className="flex justify-end">
        <Button onClick={applyAll}>合并到已持有</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4：`RecognizePage.tsx`**

```tsx
// frontend/src/pages/RecognizePage.tsx
import { useEffect, useState } from 'react';
import {
  checkBackendHealth,
  recognizeInventory,
  recognizeOperators,
  type InventoryResponse,
  type OperatorsResponse,
} from '@/api/recognition';
import { UploadDropzone } from '@/components/recognize/UploadDropzone';
import { InventoryResultEditor } from '@/components/recognize/InventoryResultEditor';
import { OperatorResultEditor } from '@/components/recognize/OperatorResultEditor';

export default function RecognizePage() {
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [invResult, setInvResult] = useState<InventoryResponse | null>(null);
  const [opResult, setOpResult] = useState<OperatorsResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkBackendHealth().then(setHealthy);
  }, []);

  async function handleInventory(file: File) {
    setError(null);
    setBusy(true);
    try {
      const r = await recognizeInventory(file);
      setInvResult(r);
    } catch (e) {
      setError(`识别失败：${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleOperators(file: File) {
    setError(null);
    setBusy(true);
    try {
      const r = await recognizeOperators(file);
      setOpResult(r);
    } catch (e) {
      setError(`识别失败：${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-12 space-y-8 max-w-4xl">
      <header>
        <div className="font-mono uppercase text-mint text-xs tracking-[0.15em] mb-2">
          SCREENSHOT RECOGNITION / 截图识别
        </div>
        <h2 className="font-display text-5xl text-white leading-[0.9]">识别</h2>
      </header>

      {healthy === false && (
        <div className="border border-ultraviolet/40 rounded-card p-4 text-sm">
          后端未连接（http://localhost:8000）。请启动 backend：<code className="font-mono text-mint">cd backend &amp;&amp; source .venv/bin/activate &amp;&amp; uvicorn app.main:app --port 8000</code>
        </div>
      )}

      <section className="space-y-4">
        <h3 className="font-mono uppercase text-mint text-xs tracking-[0.15em]">库存截图</h3>
        <UploadDropzone onFile={handleInventory} label="UPLOAD INVENTORY SCREENSHOT" />
        {busy && <div className="text-sm text-muted-foreground">识别中，请稍等…</div>}
        {error && <div className="text-sm text-ultraviolet">{error}</div>}
        {invResult && <InventoryResultEditor result={invResult} onApplied={() => setInvResult(null)} />}
      </section>

      <section className="space-y-4">
        <h3 className="font-mono uppercase text-mint text-xs tracking-[0.15em]">干员列表截图</h3>
        <UploadDropzone onFile={handleOperators} label="UPLOAD OPERATORS SCREENSHOT" />
        {opResult && <OperatorResultEditor result={opResult} onApplied={() => setOpResult(null)} />}
      </section>
    </div>
  );
}
```

- [ ] **Step 5：注册路由和导航**

`frontend/src/App.tsx`：

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import HomePage from '@/pages/HomePage';
import StockPage from '@/pages/StockPage';
import OperatorsPage from '@/pages/OperatorsPage';
import WeaponsPage from '@/pages/WeaponsPage';
import PlannerPage from '@/pages/PlannerPage';
import RecognizePage from '@/pages/RecognizePage';
import SettingsPage from '@/pages/SettingsPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="/planner" element={<PlannerPage />} />
          <Route path="/stock" element={<StockPage />} />
          <Route path="/operators" element={<OperatorsPage />} />
          <Route path="/weapons" element={<WeaponsPage />} />
          <Route path="/recognize" element={<RecognizePage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
```

`frontend/src/components/layout/Nav.tsx`（在 LINKS 数组里加一条）：

```tsx
const LINKS = [
  { to: '/', label: '首页' },
  { to: '/planner', label: '规划' },
  { to: '/stock', label: '库存' },
  { to: '/operators', label: '干员' },
  { to: '/weapons', label: '武器' },
  { to: '/recognize', label: '识别' },
  { to: '/settings', label: '设置' },
];
```

- [ ] **Step 6：验证**

```bash
cd frontend
npx tsc --noEmit
pnpm test
pnpm dev &
sleep 3
curl -s http://localhost:5173/recognize | head -10
kill %1 2>/dev/null || true
```

- [ ] **Step 7：提交**

```bash
cd /Users/nobuokita/Desktop/ZMD
git add frontend/
git commit -m "feat(frontend): recognize page with upload + result editors"
```

---

## Task 11：`start.sh` 一键启动

**Files:**
- Create: `start.sh`（可执行）

- [ ] **Step 1：写 `start.sh`**

```bash
#!/usr/bin/env bash
set -e

REPO="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO"

# ---------- backend ----------
cd backend
if [ ! -d .venv ]; then
  echo "[start.sh] Creating backend venv…"
  python3 -m venv .venv
  .venv/bin/pip install --upgrade pip
  .venv/bin/pip install -r requirements.txt
fi
source .venv/bin/activate
uvicorn app.main:app --port 8000 --reload &
BACKEND_PID=$!
echo "[start.sh] backend pid=$BACKEND_PID"
deactivate

# ---------- frontend ----------
cd ../frontend
if [ ! -d node_modules ]; then
  echo "[start.sh] Installing frontend deps…"
  pnpm install
fi
pnpm dev &
FRONTEND_PID=$!
echo "[start.sh] frontend pid=$FRONTEND_PID"

cleanup() {
  echo ""
  echo "[start.sh] Stopping services…"
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  wait
}
trap cleanup EXIT INT TERM

echo ""
echo "[start.sh] Ready:"
echo "  Frontend: http://localhost:5173"
echo "  Backend:  http://localhost:8000/docs"
echo ""
wait
```

- [ ] **Step 2：加执行权限 + 测试**

```bash
chmod +x /Users/nobuokita/Desktop/ZMD/start.sh
# 冒烟：运行 3 秒后 kill
cd /Users/nobuokita/Desktop/ZMD
./start.sh &
START_PID=$!
sleep 8
curl -sf http://localhost:8000/health && echo "backend ok"
curl -sf http://localhost:5173 | head -5 && echo "frontend ok"
kill $START_PID 2>/dev/null || true
sleep 1
# 确保进程清理了
pgrep -f "uvicorn app.main:app" && kill $(pgrep -f "uvicorn app.main:app") 2>/dev/null || true
pgrep -f "vite" && kill $(pgrep -f "vite") 2>/dev/null || true
```

- [ ] **Step 3：提交**

```bash
git add start.sh
git commit -m "feat: one-command start.sh for backend + frontend"
```

---

## Task 12：更新 README + 收尾

**Files:**
- Modify: `/Users/nobuokita/Desktop/ZMD/README.md`

- [ ] **Step 1：追加后端 + 识别功能说明**

在现有 README 的"启动"段替换为：

```md
## 启动

前置依赖：
- Node.js 20+, pnpm
- Python 3.11+

一键启动：

```bash
./start.sh
# Frontend: http://localhost:5173
# Backend docs: http://localhost:8000/docs
```

首次运行会自动建 Python venv + 装依赖（~3-5 分钟）+ 前端 pnpm install。PaddleOCR 首次识别会下载模型文件 (~50MB)。

分开启动（调试用）：

```bash
# 后端
cd backend && source .venv/bin/activate && uvicorn app.main:app --port 8000 --reload

# 前端（另一窗口）
cd frontend && pnpm dev
```
```

并在"功能清单"段加：

```md
### v2（截图识别）

- 库存截图 → 自动识别材料 + 数量，低置信度交给用户手动确认
- 干员列表截图 → 自动识别干员 + 等级
- 结果在前端编辑后一键合并到规划器数据
```

- [ ] **Step 2：提交**

```bash
cd /Users/nobuokita/Desktop/ZMD
git add README.md
git commit -m "docs: update README for Plan B (backend + recognition)"
```

---

## Self-Review Notes

| Spec 章节 | 覆盖于 |
|----------|-------|
| §3 识别管线 — preprocess / grid / template / OCR | Task 3-6 |
| §3 /recognize/inventory endpoint | Task 7 |
| §3 /recognize/operators endpoint | Task 8 |
| §2 后端无状态 | Task 1, 7, 8（无 DB，纯函数调用） |
| §6 运行 — start.sh | Task 11 |
| §5 目录结构 — backend/ | Task 1-8 |
| §7 测试 — pytest on pipelines + fixtures | Task 3-8 |
| §8 数据维护脚本 | Backlog（不在 Plan B 范围） |
| §10 风险 — PaddleOCR 首次下载 | Task 1 README 提示；Task 5 实现 |
| §10 风险 — MaaEnd 许可证 | Task 2 Step 1 |
| §10 风险 — 多分辨率 | 以 1080p 为基准，非 1080p 输入等比缩放到 1080p 画布 |

**Placeholder 扫描**：
- Task 2 `slugify` 使用 index-based 占位，**这是有意为之**：中文文件名跨系统兼容性差，用 `mat_000.png` + `materials.json` 反查更稳
- Task 7 inventory endpoint 的 `material_name` 暂时等于 `material_id`，将来 Task 7 扩展可以反查 `materials.json` 中文名——这已经是可工作的最小实现
- Task 8 干员识别只做头像+等级 OCR，其他维度留手动——**已在 Task 8 开头明确声明为 v1 范围限制**

**类型一致性**：
- `MaterialName` 前端用，后端用字符串 slug；映射通过 `materials.json`
- `TemplateLibrary`、`MatchResult` 在 Task 6 定义，Task 7/8 一致使用
- `CostMap`、`Stock`、`PlanRow` 全部来自 Plan A，Plan B 前端组件一致消费

**已知 gap（刻意不覆盖 v1）**：
- 干员的精英阶段、技能等级等的 OCR（Task 8 注明：只做头像+等级，其他手动）
- 武器识别（spec 本身就把武器识别放 backlog）
- 真实截图 fixture 套件（≥10 张）— 用户需要提供真实截图后再加，Task 7/8 用合成图覆盖逻辑路径
- 手机拍屏 / 非 1080p 精准识别（spec §10 说明 v1 只支持 1080p 原生截图）
- 数据同步脚本 `sync-data.ts` / `sync-icons.py`（spec §8 已标为 backlog）

---

## Plan B 完成后的 Backlog

1. **真实截图 fixture 套件**（≥10 张库存 + ≥5 张干员），跑回归测试
2. **干员识别扩展**：精英阶段、技能等级的 OCR/模板匹配
3. **武器识别**endpoint（复用 template matching + OCR 模式）
4. **Task #36**：用 end.wiki 做数据源核对/替换
5. **Task #5**：搜索终末地 datamine repo
6. **数据同步脚本**：`scripts/sync-data.ts` 从 zmdgraph 拉数据 diff，`scripts/sync-icons.py` 从 MaaEnd 拉新素材
7. **Tauri 打包**：一键安装的桌面 App
8. **移动端适配 + 拍屏识别**
