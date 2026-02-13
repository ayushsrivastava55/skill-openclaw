# Runtime Controller

Run this service on a remote cloud host (not on your laptop) with Docker installed.
It receives deployment jobs and starts one OpenClaw runtime container per deployment.

## Start

```bash
npm install
CONTROLLER_TOKEN=replace-me npm run runtime-controller
```

## Environment

- `CONTROLLER_TOKEN` (required): bearer token expected from app control plane.
- `PORT` (optional): default `8088`.
- `DEFAULT_RUNTIME_IMAGE` (optional): defaults to `ghcr.io/openclaw/openclaw:latest`.

## Endpoint

- `POST /deploy` with bearer auth.
- Payload fields used: `deploymentId`, `model`, `modelApiKey`, `channel`, `channelPrimaryToken`, `channelSecondaryToken` (slack only), `runtimeImage`, `callbackUrl`, `callbackToken`.

The controller starts a Docker container and the container reports status callbacks to the app via `/api/internal/runtime-status`.
