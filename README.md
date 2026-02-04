# simple-claw

High-fidelity SimpleClaw-style onboarding product that deploys OpenClaw with:
- model + channel selection
- Google sign-in
- Telegram token connect flow
- Stripe checkout hooks
- warm-slot provisioning model
- live status streaming + usage/credits

## Quick start

```bash
cp .env.example .env.local
npm install
npm run dev
```

Optional worker (recommended if you disable mock auto-processing):

```bash
npm run worker
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

The app dispatches deployment jobs to `POST /deploy` on the controller, which runs Docker containers using `runtime/entrypoint.sh` and reports statuses back to `/api/internal/runtime-status`.

## API routes

- `GET /api/check-user?email=...`
- `POST /api/checkout`
- `POST /api/checkout-credits`
- `GET /api/user-status/stream?rowId=...`
- `GET /api/api-usage?rowId=...`
- `POST /api/stripe/webhook`

## Runtime model

Current implementation ships an in-memory control plane for local development. In production, replace `lib/store.ts` with Firestore/Postgres and run `workers/control-plane.ts` as a dedicated service.

Container runtime reference is in `runtime/Dockerfile` + `runtime/entrypoint.sh`.
