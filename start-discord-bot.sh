#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE="social-media-publisher"
ENV_FILE="${SCRIPT_DIR}/discord-bot/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: .env file not found at ${ENV_FILE}" >&2
  exit 1
fi

docker run --rm \
  --name discord-bot \
  --memory=4g \
  --env-file "${ENV_FILE}" \
  "$IMAGE"
