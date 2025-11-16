#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# FastAPI サーバー起動 (.venv の python 経由)
PYTHON_BIN="${REPO_ROOT}/.venv/bin/python"
if [ ! -x "$PYTHON_BIN" ]; then
  echo "Python virtualenv not found at ${PYTHON_BIN}."
  echo "Run 'uv sync' (or create a venv) before starting the server."
  exit 1
fi

"$PYTHON_BIN" -m uvicorn api.app:app --host 0.0.0.0 --port 8000 "$@"
