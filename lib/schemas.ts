import { z } from "zod";

export const checkoutSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  cloud_plan: z.string().min(1),
  credits_per_month: z.string().min(1),
  default_model: z.enum([
    "openrouter/anthropic/claude-opus-4.5",
    "openrouter/openai/gpt-5.2",
    "openrouter/google/gemini-3-flash-preview"
  ]),
  channel: z.enum(["telegram", "discord", "whatsapp"]).default("telegram"),
  telegram_bot_token: z.string().min(1),
  profile_picture: z.string().nullable().optional(),
  model_api_key: z.string().optional()
});

export const creditCheckoutSchema = z.object({
  rowId: z.string().min(1),
  amount: z.number().min(10)
});
