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
- `GET /api/deployments/get?deploymentId=...` - Get deployment details
- `POST /api/deployments/redeploy` - Redeploy existing
- `POST /api/deployments/stop` - Stop deployment
- `POST /api/x/connect` - Start X OAuth for a deployment (user auth required)
- `GET /api/x/callback` - X OAuth callback
- `POST /api/internal/x/post` - Internal bot endpoint to publish a post on connected X account
- `POST /api/internal/x/reply` - Internal bot endpoint to reply on connected X account
- `GET /api/internal/x/mentions` - Internal bot endpoint to read mentions for connected X account

## Runtime model

Current implementation ships an in-memory control plane for local development. In production, replace `lib/store.ts` with Firestore/Postgres and run `workers/control-plane.ts` as a dedicated service.

## X Automation flow

1. Frontend calls `POST /api/x/connect` with a `deploymentId` (Firebase auth bearer token required).
2. Redirect user to returned `authorizeUrl`.
3. `GET /api/x/callback` exchanges code for user token and stores encrypted tokens in Firestore.
4. OpenClaw runtime calls internal endpoints (`/api/internal/x/*`) with bearer token:
   - `Authorization: Bearer ${INTERNAL_BOT_TOKEN || RUNTIME_CALLBACK_TOKEN}`
   - Include `deploymentId` so actions are scoped to that deployment's connected X account.
