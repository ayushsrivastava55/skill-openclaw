#!/usr/bin/env bash
set -euo pipefail

: "${OPENCLAW_PROVIDER:=openrouter}"
: "${OPENCLAW_DM_POLICY:=open}"
: "${OPENCLAW_PORT:=3001}"
: "${OPENCLAW_STATE_DIR:=/tmp/openclaw}"
: "${OPENCLAW_GATEWAY_TOKEN:=simpleclaw-runtime-token}"
: "${OPENCLAW_CHANNEL:=telegram}"

post_status() {
  local status="$1"
  local message="$2"

  if [[ -z "${RUNTIME_CALLBACK_URL:-}" || -z "${RUNTIME_CALLBACK_TOKEN:-}" || -z "${DEPLOYMENT_ID:-}" ]]; then
    return
  fi

  node -e "const [url,token,deploymentId,status,message]=process.argv.slice(1);fetch(url,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({deploymentId,status,message})}).catch(()=>{});" \
    "$RUNTIME_CALLBACK_URL" "$RUNTIME_CALLBACK_TOKEN" "$DEPLOYMENT_ID" "$status" "$message"
}

set_config() {
  timeout 20 openclaw config set "$@" >/dev/null 2>&1 || true
}

set_config_json_strict() {
  # Critical config writes (providers/models). If these fail, the bot will never come online.
  timeout 30 openclaw config set --json "$@"
}

set_config_json() {
  timeout 20 openclaw config set --json "$@" >/dev/null 2>&1 || true
}

trigger_startup_mission() {
  # Prime brand context once runtime is live so the first user interaction
  # starts from SKILL/AGENTS intent instead of generic assistant behavior.
  if [[ ! -f "/root/.openclaw/workspace/SKILL.md" ]]; then
    return
  fi

  local mission_text
  mission_text="Boot mission: load /root/.openclaw/workspace/AGENTS.md, /root/.openclaw/workspace/SKILL.md, and /root/.openclaw/workspace/HEARTBEAT.md. Operate as the deployed brand X growth/reply bot and follow those files strictly."

  set +e
  timeout 35 openclaw system event \
    --text "${mission_text}" \
    --mode now >/tmp/openclaw/startup-system-event.log 2>&1
  local event_exit=$?

  if [[ $event_exit -ne 0 ]]; then
    # Fallback for versions without `system event`: seed a private bootstrap session.
    timeout 45 openclaw agent \
      --message "${mission_text}" \
      --session-id "deployment-bootstrap" \
      --channel "${OPENCLAW_CHANNEL}" \
      --json >/tmp/openclaw/startup-agent-bootstrap.log 2>&1
  fi
  set -e
}

if [[ -z "${OPENCLAW_API_KEY:-}" ]]; then
  echo "OPENCLAW_API_KEY is required"
  exit 1
fi

if [[ -z "${OPENCLAW_CHANNEL_PRIMARY_TOKEN:-}" ]]; then
  echo "OPENCLAW_CHANNEL_PRIMARY_TOKEN is required"
  exit 1
fi

if [[ "${OPENCLAW_CHANNEL}" == "slack" && -z "${OPENCLAW_CHANNEL_SECONDARY_TOKEN:-}" ]]; then
  echo "OPENCLAW_CHANNEL_SECONDARY_TOKEN is required for slack"
  exit 1
fi

if [[ -z "${OPENCLAW_GATEWAY_TOKEN:-}" ]]; then
  OPENCLAW_GATEWAY_TOKEN="simpleclaw-$(date +%s)"
fi
export OPENCLAW_GATEWAY_TOKEN

mkdir -p "${OPENCLAW_STATE_DIR}"
export OPENCLAW_STATE_DIR
export OPENCLAW_CONFIG_PATH="${OPENCLAW_STATE_DIR}/openclaw.json"

# Current OpenClaw CLI reads provider keys from provider-specific env vars.
if [[ "${OPENCLAW_PROVIDER}" == "openrouter" ]]; then
  export OPENROUTER_API_KEY="${OPENCLAW_API_KEY}"
elif [[ "${OPENCLAW_PROVIDER}" == "openai" ]]; then
  export OPENAI_API_KEY="${OPENCLAW_API_KEY}"
elif [[ "${OPENCLAW_PROVIDER}" == "minimax" ]]; then
  # MiniMax API keys are used with Anthropic-compatible messages endpoint.
  export MINIMAX_API_KEY="${OPENCLAW_API_KEY}"
elif [[ "${OPENCLAW_PROVIDER}" == "moonshot" ]]; then
  export MOONSHOT_API_KEY="${OPENCLAW_API_KEY}"
elif [[ "${OPENCLAW_PROVIDER}" == "nvidia" ]]; then
  # NVIDIA Build (integrate.api.nvidia.com) uses an OpenAI-compatible API key.
  export NVIDIA_API_KEY="${OPENCLAW_API_KEY}"
fi

post_status "setup_started" "Container booted. Preparing OpenClaw runtime."

set +e
if [[ "${OPENCLAW_PROVIDER}" == "moonshot" ]]; then
  openclaw onboard \
    --non-interactive \
    --accept-risk \
    --auth-choice moonshot-api-key \
    --moonshot-api-key "${OPENCLAW_API_KEY}" \
    --skip-daemon \
    --skip-ui \
    --skip-health \
    --skip-skills \
    --skip-channels \
    --gateway-port "${OPENCLAW_PORT}" \
    --gateway-auth token \
    --gateway-token "${OPENCLAW_GATEWAY_TOKEN}"
elif [[ "${OPENCLAW_PROVIDER}" == "openai" ]]; then
  openclaw onboard \
    --non-interactive \
    --accept-risk \
    --auth-choice openai-api-key \
    --openai-api-key "${OPENCLAW_API_KEY}" \
    --skip-daemon \
    --skip-ui \
    --skip-health \
    --skip-skills \
    --skip-channels \
    --gateway-port "${OPENCLAW_PORT}" \
    --gateway-auth token \
    --gateway-token "${OPENCLAW_GATEWAY_TOKEN}"
elif [[ "${OPENCLAW_PROVIDER}" == "nvidia" ]]; then
  # For NVIDIA, we skip built-in auth onboarding and configure a custom OpenAI-compatible provider below.
  openclaw onboard \
    --non-interactive \
    --accept-risk \
    --auth-choice skip \
    --skip-daemon \
    --skip-ui \
    --skip-health \
    --skip-skills \
    --skip-channels \
    --gateway-port "${OPENCLAW_PORT}" \
    --gateway-auth token \
    --gateway-token "${OPENCLAW_GATEWAY_TOKEN}"
elif [[ "${OPENCLAW_PROVIDER}" == "minimax" ]]; then
  # MiniMax is configured as a custom Anthropic-compatible provider below.
  openclaw onboard \
    --non-interactive \
    --accept-risk \
    --auth-choice skip \
    --skip-daemon \
    --skip-ui \
    --skip-health \
    --skip-skills \
    --skip-channels \
    --gateway-port "${OPENCLAW_PORT}" \
    --gateway-auth token \
    --gateway-token "${OPENCLAW_GATEWAY_TOKEN}"
else
  openclaw onboard \
    --non-interactive \
    --accept-risk \
    --auth-choice openrouter-api-key \
    --openrouter-api-key "${OPENCLAW_API_KEY}" \
    --skip-daemon \
    --skip-ui \
    --skip-health \
    --skip-skills \
    --skip-channels \
    --gateway-port "${OPENCLAW_PORT}" \
    --gateway-auth token \
    --gateway-token "${OPENCLAW_GATEWAY_TOKEN}"
fi
onboard_exit=$?
set -e

if [[ $onboard_exit -ne 0 ]]; then
  post_status "setup_error" "OpenClaw onboarding failed."
  exit "$onboard_exit"
fi

# Persist gateway token in config as a belt-and-suspenders guard in case
# future CLI defaults shift between versions.
set_config gateway.auth.token "${OPENCLAW_GATEWAY_TOKEN}"
# Some OpenClaw builds also support a separate remote token; keep it aligned with the gateway token.
set_config gateway.remote.token "${OPENCLAW_GATEWAY_TOKEN}"

# Custom provider: NVIDIA Build (OpenAI-compatible base URL).
if [[ "${OPENCLAW_PROVIDER}" == "nvidia" ]]; then
  # NOTE: OpenClaw validates config on every write. Setting a nested key like
  # models.providers.nvidia.baseUrl first fails validation because models list is required.
  # Always set the whole provider object atomically.
  set_config models.mode "merge"

  nvidia_provider_json="$(
    cat <<'JSON'
{
  "baseUrl": "https://integrate.api.nvidia.com/v1",
  "api": "openai-completions",
  "apiKey": "${NVIDIA_API_KEY}",
  "models": [
    { "id": "moonshotai/kimi-k2.5", "name": "Kimi K2.5" }
  ]
}
JSON
  )"

  if ! set_config_json_strict models.providers.nvidia "${nvidia_provider_json}" >/dev/null 2>&1; then
    post_status "setup_error" "Failed to configure NVIDIA provider (models.providers.nvidia)."
    exit 1
  fi
fi

# Custom provider: MiniMax (Anthropic-compatible endpoint, per OpenClaw docs).
if [[ "${OPENCLAW_PROVIDER}" == "minimax" ]]; then
  set_config models.mode "merge"

  minimax_provider_json="$(
    cat <<JSON
{
  "baseUrl": "https://api.minimax.io/anthropic",
  "api": "anthropic-messages",
  "apiKey": "${MINIMAX_API_KEY}",
  "models": [
    { "id": "MiniMax-M2.1", "name": "MiniMax M2.1" },
    { "id": "MiniMax-M2.1-80k", "name": "MiniMax M2.1 80k" },
    { "id": "MiniMax-M2.1-thinking", "name": "MiniMax M2.1 Thinking" },
    { "id": "MiniMax-M2.1-thinking-80k", "name": "MiniMax M2.1 Thinking 80k" }
  ]
}
JSON
  )"

  if ! set_config_json_strict models.providers.minimax "${minimax_provider_json}" >/dev/null 2>&1; then
    post_status "setup_error" "Failed to configure MiniMax provider (models.providers.minimax)."
    exit 1
  fi
fi

# Browser defaults for headless runtime containers.
# This enables OpenClaw's managed browser profile (CDP + Playwright when available).
set_config browser.enabled true
set_config browser.headless true
set_config browser.noSandbox true
set_config browser.defaultProfile "openclaw"
set_config browser.executablePath "/usr/bin/chromium"
# OpenClaw validates profile objects as a unit (cdpPort/cdpUrl + color required), so set atomically.
set_config_json browser.profiles.openclaw '{"cdpPort":18800,"color":"#00D084"}'

# Allow the gateway to restart itself on config changes when supported.
set_config commands.restart true

# Disable first-run bootstrap Q&A so deployed bots don't ask setup/personality questions.
# We mount mission files directly (AGENTS.md + SKILL.md), so bootstrap ritual is unnecessary.
set_config agent.skipBootstrap true
set_config agents.defaults.skipBootstrap true

# Configure channel from deployment payload so users can paste credentials
# once and be ready without manual CLI setup.
case "${OPENCLAW_CHANNEL}" in
  telegram)
    set_config channels.telegram.enabled true
    set_config channels.telegram.botToken "${OPENCLAW_CHANNEL_PRIMARY_TOKEN}"
    # dmPolicy=open requires allowFrom to include "*", so set allowFrom first to satisfy validation.
    set_config channels.telegram.allowFrom '["*"]'
    set_config channels.telegram.dmPolicy "${OPENCLAW_DM_POLICY}"
    ;;
  discord)
    set_config channels.discord.enabled true
    set_config channels.discord.token "${OPENCLAW_CHANNEL_PRIMARY_TOKEN}"
    set_config channels.discord.dm.allowFrom '["*"]'
    set_config channels.discord.dm.policy "${OPENCLAW_DM_POLICY}"
    ;;
  slack)
    set_config channels.slack.enabled true
    set_config channels.slack.botToken "${OPENCLAW_CHANNEL_PRIMARY_TOKEN}"
    set_config channels.slack.appToken "${OPENCLAW_CHANNEL_SECONDARY_TOKEN}"
    set_config channels.slack.dm.allowFrom '["*"]'
    set_config channels.slack.dm.policy "${OPENCLAW_DM_POLICY}"
    ;;
  *)
    post_status "setup_error" "Unsupported channel. Expected telegram, discord, or slack."
    exit 1
    ;;
esac

if [[ -n "${OPENCLAW_MODEL:-}" ]]; then
  # Keep model aligned with the user-selected model from deployment payload.
  set_config agents.defaults.model.primary "${OPENCLAW_MODEL}"
fi

post_status "setup_complete" "Runtime environment configured. Finalizing channel activation."

# Newer OpenClaw versions may stage channel config but keep plugin disabled
# until doctor fix is applied. Run it once during provisioning so users can
# paste token and be live instantly.
set +e
timeout 45 openclaw doctor --fix >/tmp/openclaw/doctor-fix.log 2>&1
doctor_exit=$?
set -e

if [[ $doctor_exit -ne 0 ]]; then
  doctor_tail="$(tail -n 8 /tmp/openclaw/doctor-fix.log 2>/dev/null | tr '\n' ' ' | sed 's/  */ /g')"
  post_status "pairing_error" "OpenClaw doctor --fix failed (${doctor_exit}). ${doctor_tail}"
  exit "$doctor_exit"
fi

# doctor may rewrite defaults; enforce the deployment-selected DM policy once
# more so first message works immediately for non-technical users.
if [[ "${OPENCLAW_CHANNEL}" == "telegram" ]]; then
  set_config channels.telegram.dmPolicy "${OPENCLAW_DM_POLICY}"
  set_config channels.telegram.allowFrom '["*"]'
elif [[ "${OPENCLAW_CHANNEL}" == "discord" ]]; then
  set_config channels.discord.dm.policy "${OPENCLAW_DM_POLICY}"
  set_config channels.discord.dm.allowFrom '["*"]'
elif [[ "${OPENCLAW_CHANNEL}" == "slack" ]]; then
  set_config channels.slack.dm.policy "${OPENCLAW_DM_POLICY}"
  set_config channels.slack.dm.allowFrom '["*"]'
fi

post_status "telegram_pairing_started" "Starting OpenClaw gateway."

set +e
openclaw gateway --allow-unconfigured --port "${OPENCLAW_PORT}" --bind loopback --token "${OPENCLAW_GATEWAY_TOKEN}" &
gateway_pid=$!
set -e

sleep 3
if ! kill -0 "$gateway_pid" >/dev/null 2>&1; then
  wait "$gateway_pid"
  gateway_exit=$?
  post_status "pairing_error" "OpenClaw gateway failed to start."
  exit "$gateway_exit"
fi

trigger_startup_mission

post_status "telegram_pairing_complete" "OpenClaw gateway is running and ready."

set +e
wait "$gateway_pid"
gateway_exit=$?
set -e

if [[ $gateway_exit -ne 0 ]]; then
  post_status "pairing_error" "OpenClaw gateway exited unexpectedly."
  exit "$gateway_exit"
fi
