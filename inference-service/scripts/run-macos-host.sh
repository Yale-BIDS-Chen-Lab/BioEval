#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
DOCKER_ENV_FILE="$ROOT_DIR/docker-files/.env"
PYTHON_VERSION="${BIOEVAL_HOST_PYTHON_VERSION:-3.12}"

for candidate in "$HOME/.local/bin" "$HOME/Library/Python/3.14/bin"; do
  if [[ -d "$candidate" && ":$PATH:" != *":$candidate:"* ]]; then
    export PATH="$candidate:$PATH"
  fi
done

ensure_uv() {
  if command -v uv >/dev/null 2>&1; then
    return 0
  fi

  echo "uv not found. Installing a user-local copy with pip..."
  if ! python3 -m pip install --user uv; then
    return 1
  fi

  local user_base
  user_base="$(python3 -c 'import site; print(site.USER_BASE)')"
  export PATH="$user_base/bin:$PATH"

  if ! command -v uv >/dev/null 2>&1; then
    return 1
  fi

  return 0
}

run_with_pip_fallback() {
  echo "Falling back to a local virtualenv because uv is unavailable."

  local venv_dir="$ROOT_DIR/inference-service/.venv"
  if [[ ! -x "$venv_dir/bin/python" ]]; then
    python3 -m venv "$venv_dir"
  fi

  if ! "$venv_dir/bin/python" -m pip --version >/dev/null 2>&1; then
    "$venv_dir/bin/python" -m ensurepip --upgrade
  fi

  "$venv_dir/bin/python" -m pip install --upgrade pip

  mapfile -t deps < <(
    "$venv_dir/bin/python" -c '
import pathlib
import tomllib

data = tomllib.loads(pathlib.Path("pyproject.toml").read_text())
for dependency in data["project"]["dependencies"]:
    print(dependency)
'
  )

  "$venv_dir/bin/pip" install "${deps[@]}"
  "$venv_dir/bin/python" src/__main__.py
}

if [[ -f "$DOCKER_ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$DOCKER_ENV_FILE"
  set +a
fi

export DATABASE_URL="${DATABASE_URL:-postgresql://${POSTGRES_USER:-test}:${POSTGRES_PASSWORD:-test}@localhost:${POSTGRES_HOST_PORT:-5432}/${POSTGRES_DB:-bioeval}}"
export RABBITMQ_HOST="${RABBITMQ_HOST:-localhost}"
export RABBITMQ_USER="${RABBITMQ_USER:-guest}"
export RABBITMQ_PASSWORD="${RABBITMQ_PASSWORD:-guest}"
export S3_ENDPOINT="${S3_ENDPOINT:-localhost:${MINIO_API_HOST_PORT:-9000}}"
export S3_ENDPOINT_URL="${S3_ENDPOINT_URL:-http://${S3_ENDPOINT}}"
export S3_REGION="${S3_REGION:-us-east-1}"
export S3_URL_STYLE="${S3_URL_STYLE:-path}"
export S3_USE_SSL="${S3_USE_SSL:-false}"
export INFERENCE_HTTP_HOST="${INFERENCE_HTTP_HOST:-0.0.0.0}"
export INFERENCE_HTTP_PORT="${INFERENCE_HTTP_PORT:-8000}"
export MINIO_ROOT_USER="${MINIO_ROOT_USER:-minio-root-user}"
export MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-minio-root-password}"
export PYTORCH_ENABLE_MPS_FALLBACK="${PYTORCH_ENABLE_MPS_FALLBACK:-1}"
export UV_CACHE_DIR="${UV_CACHE_DIR:-$ROOT_DIR/inference-service/.cache/uv}"

cd "$ROOT_DIR/inference-service"

if ensure_uv; then
  uv run --python "$PYTHON_VERSION" src
else
  run_with_pip_fallback
fi
