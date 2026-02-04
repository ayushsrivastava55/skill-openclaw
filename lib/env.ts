import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  EXECUTION_MODE: z.enum(["mock", "remote-http"]).default("mock"),
  RUNTIME_CONTROLLER_URL: z.string().url().optional(),
  RUNTIME_CONTROLLER_TOKEN: z.string().optional(),
  RUNTIME_CALLBACK_TOKEN: z.string().default("dev-runtime-token"),
  RUNTIME_STATUS_CALLBACK_URL: z.string().url().optional(),
  OPENCLAW_RUNTIME_IMAGE: z.string().default("ghcr.io/openclaw/openclaw:latest"),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_DEPLOY: z.string().optional(),
  STRIPE_PRICE_CREDITS: z.string().optional(),
  ENCRYPTION_KEY: z.string().min(16).default("dev-only-change-me"),
  WARM_POOL_SIZE: z.coerce.number().int().positive().default(5),
  PLATFORM_OPENROUTER_API_KEY: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_API_KEY: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_APP_ID: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: z.string().optional()
});

export const env = schema.parse(process.env);
