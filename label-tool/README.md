# label-tool

Standalone admin utility to capture in-game template crops from screenshots and
persist them to `backend/app/assets/{materials,operators,weapons}/`. Not part of
the user-facing planner; runs on its own port (**5174**, `strictPort`).

## Run

1. Start backend (port 8000):
   ```bash
   cd backend && source .venv/bin/activate && uvicorn app.main:app --port 8000
   ```
2. Install deps (first time only):
   ```bash
   cd label-tool && pnpm install
   ```
3. Run the labeling UI:
   ```bash
   pnpm dev    # http://localhost:5174
   ```

## Modes

Toggle at the top: **自动提取** (default) or **手动标注**.

### 自动提取

Batch workflow. Best when the backend slot detector works on the screen you're
labeling (most rosters, single-panel inventory).

1. Pick an asset type (材料 / 干员 / 武器).
2. Drop one or more screenshots anywhere on the page (or click the picker).
   Non-image files are rejected with a toast.
3. Click **提取 slot**. Each file is sent to `POST /dev/{asset_type}/extract-slots`;
   detected crops accumulate in the grid.
4. For each slot, pick the matching name (or leave "— 不导入 —" to skip).
5. Click **保存 N 条** — only labeled entries are POSTed to
   `/dev/{asset_type}/save-templates`. Names already in the labeled tracker are
   skipped (response reports `{saved, skipped[]}`).

### 手动标注

Draw-your-own-crops workflow. Use when auto-detect misses cards (e.g. the
武陵仓库 dual-panel inventory, where Otsu picks item silhouettes instead of card
rectangles).

1. Upload **one** screenshot.
2. Zoom: `50% / 100% / 适应宽度`.
3. **Draw a box**: click+drag on the image. Enforced 1:1 square (matches the
   backend's 100×100 normalized thumbnail — non-square crops would distort on
   match).
4. **Edit a box**: click inside to select. Drag to move, drag a corner handle
   to resize (square preserved), `Delete` / `Backspace` to remove, `Escape` to
   deselect. `Delete` inside the name picker doesn't trigger removal.
5. Click **开始命名 (N) →** to enter the naming page. Larger thumbnails, one
   picker per box. Clicking a thumbnail jumps back to the canvas with that box
   pre-selected so you can adjust a mislabeled crop.
6. **保存 N 条** → crops are rendered to 100×100 PNGs via `<canvas>` on the
   client and POSTed to `/dev/{asset_type}/save-templates`. After save, named
   boxes drop from the list; if nothing's left, the screenshot clears and you
   bounce back to the draw page for the next one.

## Managing already-labeled templates

The **查看/管理已标注 (N)** link expands a grid of current templates. Click
**删除** on one to remove its PNG + drop it from `{asset_type}.labeled.json`
(you can then re-label the same name from a better screenshot). Never fires
through auto-save skip.

Reloading the page discards local UI state (pending files / drawn boxes). No
client-side persistence by design.
