#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$SCRIPT_DIR"

export INFERENCE_SERVICE_URL="${INFERENCE_SERVICE_URL:-http://host.docker.internal:8000}"

docker compose up --build \
  db \
  rabbitmq \
  minio \
  createbuckets \
  migrate \
  backend \
  frontend
