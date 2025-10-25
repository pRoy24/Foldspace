#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REQUIREMENTS_FILE="${PROJECT_ROOT}/scripts/requirements.txt"
ENV_DIR="${UV_ENV_DIR:-${PROJECT_ROOT}/.venv}"
PORT="${PORT:-3000}"
PM2_APP_NAME="${PM2_APP_NAME:-foldspace-fastapi}"
UV_BIN="${UV_BIN:-$HOME/.local/bin/uv}"

export PATH="$HOME/.local/bin:$PATH"

echo "[setup] Using project root: ${PROJECT_ROOT}"
echo "[setup] Python environment directory: ${ENV_DIR}"

install_uv() {
  if command -v uv >/dev/null 2>&1; then
    return
  fi
  echo "[setup] Installing uv (Astral Python toolchain manager)..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
  hash -r
  if ! command -v uv >/dev/null 2>&1; then
    echo "[error] uv installation failed or PATH not updated." >&2
    exit 1
  fi
}

install_pm2() {
  if command -v pm2 >/dev/null 2>&1; then
    return
  fi
  echo "[setup] Installing pm2 globally via npm..."
  if ! command -v npm >/dev/null 2>&1; then
    echo "[error] npm is required to install pm2. Please install Node.js + npm first." >&2
    exit 1
  fi
  npm install -g pm2
  hash -r
}

create_env() {
  if [[ -d "${ENV_DIR}" ]]; then
    echo "[setup] Using existing uv virtual environment at ${ENV_DIR}"
    return
  fi
  echo "[setup] Creating uv-managed virtual environment..."
  "${UV_BIN}" venv "${ENV_DIR}"
}

install_requirements() {
  echo "[setup] Installing Python dependencies from ${REQUIREMENTS_FILE}"
  "${UV_BIN}" pip install -r "${REQUIREMENTS_FILE}" --python "${ENV_DIR}/bin/python"
}

start_pm2() {
  install_pm2
  local python_bin="${ENV_DIR}/bin/python"
  if [[ ! -x "${python_bin}" ]]; then
    echo "[error] Python binary not found at ${python_bin}" >&2
    exit 1
  fi

  echo "[pm2] Restarting ${PM2_APP_NAME} on port ${PORT}"
  pm2 delete "${PM2_APP_NAME}" >/dev/null 2>&1 || true
  pm2 start "${python_bin}" --name "${PM2_APP_NAME}" -- \
    -m uvicorn scripts.fastapi_server:app --host 0.0.0.0 --port "${PORT}"
  pm2 save
}

install_uv
create_env
install_requirements
start_pm2

echo "[done] FastAPI server is managed by pm2 (pm2 status)."
