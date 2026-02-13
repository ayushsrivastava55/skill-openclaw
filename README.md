# simple-claw

High-fidelity SimpleClaw-style onboarding product that deploys OpenClaw with:
- model + channel selection
- Google sign-in
- Telegram / Discord / Slack token connect flow
- PayPal checkout
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
- `POST /api/chat`
- `POST /api/paypal/capture-order`
- `GET /api/user-status/stream?rowId=...`
- `GET /api/api-usage?rowId=...`

Pages:
- `/chat` (web chat UI connected to deployed runtime)

## Runtime model

Current implementation ships an in-memory control plane for local development. In production, replace `lib/store.ts` with Firestore/Postgres and run `workers/control-plane.ts` as a dedicated service.

Container runtime reference is in `runtime/Dockerfile` + `runtime/entrypoint.sh`.

## Google OAuth setup

1. In Firebase Console, enable `Authentication -> Google`.
2. Add your server IP/domain to Firebase authorized domains.
3. Fill client env vars in `.env.local`:
   - `NEXT_PUBLIC_FIREBASE_API_KEY`
   - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
   - `NEXT_PUBLIC_FIREBASE_APP_ID`
   - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
4. Set `FIREBASE_SERVICE_ACCOUNT_JSON` (single-line JSON) so backend routes can verify Firebase ID tokens.
5. Restart the app process/service.

Protected routes now requiring Firebase bearer token:
- `GET /api/check-user`
- `POST /api/checkout`
- `POST /api/checkout-credits`

## PayPal setup

1. Create a PayPal app in the PayPal Developer dashboard.
2. Use sandbox credentials for testing, then switch to live credentials.
3. Add these env vars:
   - `PAYPAL_CLIENT_ID`
   - `PAYPAL_CLIENT_SECRET`
   - `PAYPAL_ENV=sandbox` (or `live`)
   - `PAYPAL_WEBHOOK_ID`
   - `PAYPAL_PLAN_STARTER_MONTHLY`
   - `PAYPAL_PLAN_STARTER_YEARLY`
   - `PAYPAL_PLAN_PRO_MONTHLY`
   - `PAYPAL_PLAN_PRO_YEARLY`
4. Set app URL env to your production domain:
   - `NEXT_PUBLIC_APP_URL=https://quickclaw.xyz`

The app creates PayPal subscriptions server-side, redirects users to PayPal approval, captures orders for credits, and listens to webhooks at `POST /api/paypal/webhook`.
