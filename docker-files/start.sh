#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "starting services"
docker compose up --build
# docker compose up -d --build
# docker attach --sig-proxy=false docker-files-inference-1

trap 'echo "stopping services"; docker compose down; exit 0' INT

echo "services are running"
while true; do
    sleep 1
done