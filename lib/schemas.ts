import { z } from "zod";

export const checkoutSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  plan: z.enum(["starter", "pro"]).default("starter"),
  cloud_plan: z.string().optional(),
  credits_per_month: z.string().min(1),
  model_provider: z.enum(["openrouter", "openai", "moonshot", "nvidia"]).default("openrouter"),
  default_model: z.enum([
    "openrouter/anthropic/claude-opus-4.5",
    "openrouter/anthropic/claude-opus-4.6",
    "openrouter/openai/gpt-5.2",
    "openrouter/google/gemini-3-flash-preview",
    "openrouter/moonshotai/kimi-k2.5",
    "openrouter/minimax/minimax-m2.1",
    "openai/codex-mini-latest",
    "openai/gpt-4",
    "openai/gpt-4-turbo",
    "openai/gpt-4.1",
    "openai/gpt-4.1-mini",
    "openai/gpt-4.1-nano",
    "openai/gpt-4o",
    "openai/gpt-4o-2024-05-13",
    "openai/gpt-4o-2024-08-06",
    "openai/gpt-4o-2024-11-20",
    "openai/gpt-4o-mini",
    "openai/gpt-5",
    "openai/gpt-5-chat-latest",
    "openai/gpt-5-codex",
    "openai/gpt-5-mini",
    "openai/gpt-5-nano",
    "openai/gpt-5-pro",
    "openai/gpt-5.1",
    "openai/gpt-5.1-chat-latest",
    "openai/gpt-5.1-codex",
    "openai/gpt-5.1-codex-max",
    "openai/gpt-5.1-codex-mini",
    "openai/gpt-5.2",
    "openai/gpt-5.2-chat-latest",
    "openai/gpt-5.2-codex",
    "openai/gpt-5.2-pro",
    "openai/gpt-5.3-codex",
    "openai/o1",
    "openai/o1-pro",
    "openai/o3",
    "openai/o3-deep-research",
    "openai/o3-mini",
    "openai/o3-pro",
    "openai/o4-mini",
    "openai/o4-mini-deep-research",
    "moonshot/kimi-k2.5",
    "nvidia/moonshotai/kimi-k2.5"
  ]),
  billing_interval: z.enum(["monthly", "yearly"]).default("monthly"),
  channel: z.enum(["telegram", "discord", "slack"]).default("telegram"),
  telegram_bot_token: z.string().optional(),
  discord_bot_token: z.string().optional(),
  slack_bot_token: z.string().optional(),
  slack_app_token: z.string().optional(),
  profile_picture: z.string().nullable().optional(),
  model_api_key: z.string().optional()
}).superRefine((input, ctx) => {
  const telegramToken = input.telegram_bot_token?.trim() ?? "";
  const discordToken = input.discord_bot_token?.trim() ?? "";
  const slackBotToken = input.slack_bot_token?.trim() ?? "";
  const slackAppToken = input.slack_app_token?.trim() ?? "";
  const modelKey = input.model_api_key?.trim() ?? "";

  if (input.plan === "pro" && input.model_provider !== "openrouter") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["model_provider"],
      message: "Pro plan uses OpenRouter credits and must use OpenRouter provider."
    });
  }

  if (input.plan === "starter" && !modelKey) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["model_api_key"],
      message:
        input.model_provider === "openai"
          ? "Starter requires your OpenAI API key."
          : input.model_provider === "moonshot"
            ? "Starter requires your Moonshot API key."
            : input.model_provider === "nvidia"
              ? "Starter requires your NVIDIA API key (from build.nvidia.com)."
              : "Starter requires your OpenRouter API key."
    });
  }

  const isOpenRouterModel = input.default_model.startsWith("openrouter/");
  const isOpenAIModel = input.default_model.startsWith("openai/");
  const isMoonshotModel = input.default_model.startsWith("moonshot/");
  const isNvidiaModel = input.default_model.startsWith("nvidia/");
  if (input.model_provider === "openrouter" && !isOpenRouterModel) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["default_model"],
      message: "Selected model does not match provider (expected an OpenRouter model)."
    });
  }
  if (input.model_provider === "openai" && !isOpenAIModel) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["default_model"],
      message: "Selected model does not match provider (expected an OpenAI model)."
    });
  }
  if (input.model_provider === "moonshot" && !isMoonshotModel) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["default_model"],
      message: "Selected model does not match provider (expected a Moonshot model)."
    });
  }
  if (input.model_provider === "nvidia" && !isNvidiaModel) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["default_model"],
      message: "Selected model does not match provider (expected an NVIDIA model)."
    });
  }

  if (input.channel === "telegram") {
    if (!telegramToken) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["telegram_bot_token"],
        message: "Telegram bot token is required."
      });
    }
    if (telegramToken && !telegramToken.includes(":")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["telegram_bot_token"],
        message: "Telegram bot token must include ':'."
      });
    }
  }

  if (input.channel === "discord" && !discordToken) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["discord_bot_token"],
      message: "Discord bot token is required."
    });
  }

  if (input.channel === "slack") {
    if (!slackBotToken) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["slack_bot_token"],
        message: "Slack bot token is required."
      });
    }
    if (!slackAppToken) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["slack_app_token"],
        message: "Slack app token is required."
      });
    }
    if (slackBotToken && !slackBotToken.startsWith("xoxb-")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["slack_bot_token"],
        message: "Slack bot token should start with xoxb-."
      });
    }
    if (slackAppToken && !slackAppToken.startsWith("xapp-")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["slack_app_token"],
        message: "Slack app token should start with xapp-."
      });
    }
  }
});

export const creditCheckoutSchema = z.object({
  rowId: z.string().min(1),
  amount: z.number().min(10)
});

export const chatSchema = z.object({
  deploymentId: z.string().min(1),
  message: z.string().min(1).max(4000),
  sessionId: z.string().min(1).max(128).optional()
});

export const redeploySchema = z
  .object({
    deploymentId: z.string().min(1),
    channel: z.enum(["telegram", "discord", "slack"]),
    telegram_bot_token: z.string().optional(),
    discord_bot_token: z.string().optional(),
    slack_bot_token: z.string().optional(),
    slack_app_token: z.string().optional()
  })
  .superRefine((input, ctx) => {
    const telegramToken = input.telegram_bot_token?.trim() ?? "";
    const discordToken = input.discord_bot_token?.trim() ?? "";
    const slackBotToken = input.slack_bot_token?.trim() ?? "";
    const slackAppToken = input.slack_app_token?.trim() ?? "";

    if (input.channel === "telegram") {
      if (!telegramToken) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["telegram_bot_token"],
          message: "Telegram bot token is required."
        });
      }
      if (telegramToken && !telegramToken.includes(":")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["telegram_bot_token"],
          message: "Telegram bot token must include ':'."
        });
      }
    }

    if (input.channel === "discord" && !discordToken) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["discord_bot_token"],
        message: "Discord bot token is required."
      });
    }

    if (input.channel === "slack") {
      if (!slackBotToken) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slack_bot_token"],
          message: "Slack bot token is required."
        });
      }
      if (!slackAppToken) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slack_app_token"],
          message: "Slack app token is required."
        });
      }
      if (slackBotToken && !slackBotToken.startsWith("xoxb-")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slack_bot_token"],
          message: "Slack bot token should start with xoxb-."
        });
      }
      if (slackAppToken && !slackAppToken.startsWith("xapp-")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slack_app_token"],
          message: "Slack app token should start with xapp-."
        });
      }
    }
  });
