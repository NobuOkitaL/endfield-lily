#!/usr/bin/env bash
set -e

REPO="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO"

# ---------- backend ----------
cd "$REPO/backend"
if [ ! -d .venv ]; then
  echo "[start.sh] Creating backend venv..."
  python3 -m venv .venv
  .venv/bin/pip install --upgrade pip
  .venv/bin/pip install -r requirements.txt
fi
# Launch uvicorn in a subshell so we don't need deactivate
(source .venv/bin/activate && uvicorn app.main:app --port 8000 --reload) &
BACKEND_PID=$!
echo "[start.sh] backend pid=$BACKEND_PID"

# ---------- frontend ----------
cd "$REPO/frontend"
if [ ! -d node_modules ]; then
  echo "[start.sh] Installing frontend deps..."
  pnpm install
fi
pnpm dev &
FRONTEND_PID=$!
echo "[start.sh] frontend pid=$FRONTEND_PID"

cleanup() {
  echo ""
  echo "[start.sh] Stopping services..."
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
