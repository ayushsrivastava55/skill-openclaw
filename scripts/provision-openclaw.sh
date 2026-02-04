#!/usr/bin/env bash
set -euo pipefail

MODEL="${1:-}"
API_KEY="${2:-}"
TELEGRAM_TOKEN="${3:-}"

if [[ -z "$MODEL" || -z "$API_KEY" || -z "$TELEGRAM_TOKEN" ]]; then
  echo "usage: scripts/provision-openclaw.sh <model> <api_key> <telegram_token>"
  exit 1
fi

npx openclaw@latest onboard \
  --provider openrouter \
  --model "$MODEL" \
  --api-key "$API_KEY" \
  --telegram "$TELEGRAM_TOKEN" \
  --dm-policy pairing

npx openclaw@latest start --headless --daemon --host 0.0.0.0 --port 3001
