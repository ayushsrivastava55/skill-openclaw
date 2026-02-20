# Brand Deploy Console

Deploy AI-powered Telegram bots with brand-specific capabilities.

## Features

- AI-generated brand personas (SKILL.md)
- Automated task checklists (HEARTBEAT.md)
- Tiered brand research (fast pass + deep pass) with source-backed artifacts
- Crawlee-backed website research engine (with basic HTTP fallback)
- Multiple model providers (OpenRouter, OpenAI, MiniMax, Moonshot, NVIDIA)
- Real-time deployment status tracking
- Warm-slot provisioning model

## Quick start

```bash
cp .env.example .env.local
npm install
npm run dev
```

## Real execution (remote runtime)

By default, execution mode is `mock` and no OpenClaw runtime is launched.
To deploy real user instances, run a remote runtime controller on your cloud host:

```bash
# on the cloud host
CONTROLLER_TOKEN=replace-me tsx runtime/controller/server.ts
```

Then set app env:

```bash
EXECUTION_MODE=remote-http
RUNTIME_CONTROLLER_URL=https://your-controller-host:8088
RUNTIME_CONTROLLER_TOKEN=replace-me
RUNTIME_CALLBACK_TOKEN=replace-callback-token
RUNTIME_STATUS_CALLBACK_URL=https://your-app-domain/api/internal/runtime-status
OPENCLAW_RUNTIME_IMAGE=ghcr.io/openclaw/openclaw:latest
```

## API routes

- `POST /api/brand-deploy` - Deploy brand bot
- `GET /api/user-status/stream?rowId=...` - Stream deployment status
- `GET /api/deployments/list` - List deployments
- `GET /api/deployments/get?deploymentId=...` - Get deployment details
- `POST /api/deployments/recover` - Recover latest deployment by Telegram bot token
- `GET /api/deployments/research?deploymentId=...` - Latest research run status, confidence, facts, and sources
- `POST /api/deployments/redeploy` - Redeploy existing
- `POST /api/deployments/stop` - Stop deployment
- `POST /api/x/connect` - Start X OAuth for a deployment (requires `deploymentId` + matching Telegram token)
- `POST /api/x/connect` - Start X OAuth (preconnect mode before deployment, or deployment-scoped mode)
- `POST /api/x/profile` - Fetch connected X profile + brand hints via `x_user_key`
- `GET /api/x/callback` - X OAuth callback
- `POST /api/internal/x/post` - Internal bot endpoint to publish a post on connected X account
- `POST /api/internal/x/reply` - Internal bot endpoint to reply on connected X account
- `GET /api/internal/x/mentions` - Internal bot endpoint to read mentions for connected X account
- `GET /api/internal/x/discover` - Internal bot endpoint to discover candidate tweets via X recent search
- `GET /api/internal/x/metrics` - Internal bot endpoint to read action/cooldown history for pacing

## Runtime model

Runtime control remains app-driven, and persistent app data is stored in Neon Postgres (configure `NEON_DATABASE_URL` or `DATABASE_URL`).
MiniMax BYOK runtime uses OpenClaw's recommended Anthropic-compatible provider config (`https://api.minimax.io/anthropic`, `api: anthropic-messages`).
Set `BRAND_RESEARCH_PIPELINE_ENABLED=1` to enable Pomelli-style research enrichment.
Set `RESEARCH_CRAWLER_ENGINE=adaptive` (default) to use Cheerio first, then Playwright fallback for JS-heavy pages.
Supported modes: `adaptive`, `cheerio`, `playwright`, `basic`, `crawlee` (alias of `cheerio`).
Set `RESEARCH_ENABLE_GUESS_PATHS=1` only if you want probing of guessed paths like `/about` and `/pricing`.
Runtime entrypoint disables OpenClaw first-run bootstrap prompts and injects `AGENTS.md` + `SKILL.md` + `HEARTBEAT.md` on boot so brand mission is loaded immediately.
X reply-guy guardrails are configurable via:
- `X_POST_COOLDOWN_MINUTES` (default `60`)
- `X_REPLY_COOLDOWN_MINUTES` (default `3`)
- `X_CONTENT_DEDUPE_WINDOW_HOURS` (default `24`)
- `X_REPLY_THREAD_USER_LIMIT` (default `1`)

## X Automation flow

1. Frontend calls `POST /api/x/connect` with:
   - `deploymentId`
   - `telegram_bot_token` that matches the deployment's stored Telegram token
2. Redirect user to returned `authorizeUrl`.
3. `GET /api/x/callback` exchanges code for user token and stores encrypted tokens in Neon Postgres.
4. On deploy, if no deployment-scoped X connection exists, the user-level X connection is auto-attached.
5. OpenClaw runtime calls internal endpoints (`/api/internal/x/*`) with bearer token:
   - `Authorization: Bearer ${INTERNAL_BOT_TOKEN || RUNTIME_CALLBACK_TOKEN}`
   - Include `deploymentId` so actions are scoped to that deployment's connected X account.
