#!/usr/bin/env bash
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "[start.sh] Node.js 20+ not found. Install from https://nodejs.org/" >&2
  exit 1
fi

exec node "$REPO/start.mjs" "$@"
