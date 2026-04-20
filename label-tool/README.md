# label-tool

Standalone admin utility to capture in-game template crops from screenshots and
persist them to `backend/app/assets/{materials,operators,weapons}/`. Not part of
the user-facing planner; runs on its own port.

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

## Workflow

1. Pick an asset type (材料 / 干员 / 武器). The select options update to the
   names registered in the matching backend JSON.
2. Upload one or more game screenshots. Click **提取 slot** — each file is sent
   to `POST /dev/{asset_type}/extract-slots`; results accumulate in the grid.
3. For each slot, choose the matching name from the dropdown (or leave "— 跳过 —").
4. Click **保存 N 条** — only labeled entries are POSTed to
   `/dev/{asset_type}/save-templates`, which writes PNGs and updates the JSON.

Reloading the page discards local state. No persistence by design.
