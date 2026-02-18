# Brand Deploy Console

Deploy AI-powered Telegram bots with brand-specific capabilities.

## Features

- AI-generated brand personas (SKILL.md)
- Automated task checklists (HEARTBEAT.md)
- Multiple model providers (OpenRouter, OpenAI, Moonshot, NVIDIA)
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
- `GET /api/deployments/get?id=...` - Get deployment details
- `POST /api/deployments/redeploy` - Redeploy existing
- `POST /api/deployments/stop` - Stop deployment

## Runtime model

Current implementation ships an in-memory control plane for local development. In production, replace `lib/store.ts` with Firestore/Postgres and run `workers/control-plane.ts` as a dedicated service.
