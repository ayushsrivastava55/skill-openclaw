#!/usr/bin/env bash
set -euo pipefail

: "${OPENCLAW_PROVIDER:=openrouter}"
: "${OPENCLAW_DM_POLICY:=pairing}"
: "${OPENCLAW_PORT:=3001}"

post_status() {
  local status="$1"
  local message="$2"

  if [[ -z "${RUNTIME_CALLBACK_URL:-}" || -z "${RUNTIME_CALLBACK_TOKEN:-}" || -z "${DEPLOYMENT_ID:-}" ]]; then
    return
  fi

  node -e "const [url,token,deploymentId,status,message]=process.argv.slice(1);fetch(url,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({deploymentId,status,message})}).catch(()=>{});" \
    "$RUNTIME_CALLBACK_URL" "$RUNTIME_CALLBACK_TOKEN" "$DEPLOYMENT_ID" "$status" "$message"
}

if [[ -z "${OPENCLAW_MODEL:-}" ]]; then
  echo "OPENCLAW_MODEL is required"
  exit 1
fi

if [[ -z "${OPENCLAW_API_KEY:-}" ]]; then
  echo "OPENCLAW_API_KEY is required"
  exit 1
fi

if [[ -z "${TELEGRAM_BOT_TOKEN:-}" ]]; then
  echo "TELEGRAM_BOT_TOKEN is required"
  exit 1
fi

post_status "setup_started" "Container booted. Running OpenClaw onboarding."

set +e
openclaw onboard \
  --provider "${OPENCLAW_PROVIDER}" \
  --model "${OPENCLAW_MODEL}" \
  --api-key "${OPENCLAW_API_KEY}" \
  --telegram "${TELEGRAM_BOT_TOKEN}" \
  --dm-policy "${OPENCLAW_DM_POLICY}"
onboard_exit=$?
set -e

if [[ $onboard_exit -ne 0 ]]; then
  post_status "setup_error" "OpenClaw onboarding failed."
  exit $onboard_exit
fi

post_status "setup_complete" "OpenClaw onboarding completed."
post_status "telegram_pairing_started" "Waiting for Telegram pairing."

set +e
openclaw start --headless --daemon --host 0.0.0.0 --port "${OPENCLAW_PORT}"
start_exit=$?
set -e

if [[ $start_exit -ne 0 ]]; then
  post_status "pairing_error" "OpenClaw daemon failed to start."
  exit $start_exit
fi

post_status "telegram_pairing_complete" "OpenClaw daemon started and ready."

tail -f /dev/null
