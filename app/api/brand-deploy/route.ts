import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createBrandDeploymentConfig,
  prepareBrandFilesForDeployment,
  refreshRuntimeBrandFiles
} from "@/lib/brand-deploy";
import { runDeepBrandResearch, runFastBrandResearch, saveResearchArtifacts } from "@/lib/brand-research";
import { env } from "@/lib/env";
import { dispatchRuntimeDeployment } from "@/lib/runtime-executor";
import { getXUserTweets } from "@/lib/x-api";
import {
  createDeployment,
  getDeploymentById,
  getUserById,
  getXConnectionByDeploymentId,
  getXUserConnectionByUserId,
  saveDeploymentArtifact,
  saveXConnection,
  updateDeploymentById,
  updateDeploymentStatus,
  upsertUser
} from "@/lib/store";
import { encrypt } from "@/lib/security";
import type { BrandConfig, ResearchContext } from "@/lib/brand-types";
import type { DeploymentRecord, ModelProviderId } from "@/lib/types";
import { getValidXAccessTokenForUser } from "@/lib/x-service";

const providerSchema = z.enum(["openrouter", "openai", "minimax", "moonshot", "nvidia"]);

const requestSchema = z.object({
  deploymentId: z.string().min(1).optional(),
  model_provider: providerSchema.default("openrouter"),
  model: z.string().min(1),
  telegram_bot_token: z.string().min(1),
  model_api_key: z.string().optional(),
  x_user_key: z.string().min(1).optional(),
  brand: z.object({
    name: z.string().min(1),
    website: z.string().optional(),
    description: z.string().min(1),
    industry: z.string().optional(),
    targetAudience: z.string().optional(),
    tone: z.string().optional(),
    products: z.array(z.string()).optional(),
    additionalContext: z.string().optional(),
    socialLinks: z
      .object({
        twitter: z.string().optional(),
        instagram: z.string().optional(),
        linkedin: z.string().optional(),
        facebook: z.string().optional(),
        tiktok: z.string().optional()
      })
      .optional()
  })
});

function cleanOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function cleanStringArray(values: string[] | undefined): string[] | undefined {
  if (!values?.length) return undefined;
  const cleaned = values.map((item) => item.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : undefined;
}

function normalizeBrand(brand: z.infer<typeof requestSchema>["brand"]): BrandConfig {
  const socialLinks = brand.socialLinks
    ? Object.fromEntries(
        Object.entries(brand.socialLinks)
          .map(([platform, url]) => [platform, url?.trim()])
          .filter(([, url]) => Boolean(url))
      )
    : undefined;

  return {
    name: brand.name.trim(),
    website: brand.website?.trim() ?? "",
    description: brand.description.trim(),
    industry: cleanOptional(brand.industry),
    targetAudience: cleanOptional(brand.targetAudience),
    tone: cleanOptional(brand.tone),
    products: cleanStringArray(brand.products),
    additionalContext: cleanOptional(brand.additionalContext),
    socialLinks: socialLinks && Object.keys(socialLinks).length > 0 ? socialLinks : undefined
  };
}

async function enrichBrandWithXSignals(brand: BrandConfig, userId: string): Promise<BrandConfig> {
  try {
    const { connection, accessToken } = await getValidXAccessTokenForUser(userId);
    const tweetsPayload = await getXUserTweets(accessToken, connection.xUserId, { maxResults: 12 });
    const tweets = Array.isArray(tweetsPayload.data) ? tweetsPayload.data : [];
    const tweetTexts = tweets
      .map((item) => (typeof item.text === "string" ? item.text.trim() : ""))
      .filter((text) => text.length > 0)
      .slice(0, 8);

    if (tweetTexts.length === 0) {
      return brand;
    }

    const twitterUrl = `https://x.com/${connection.username}`;
    const existingContext = brand.additionalContext?.trim() ?? "";
    const xContext = [
      "Connected X operational context (channel/distribution only; not canonical brand identity):",
      `- Handle: @${connection.username}`,
      `- Profile URL: ${twitterUrl}`,
      "- Recent posts:",
      ...tweetTexts.map((text, idx) => `  ${idx + 1}. ${text}`)
    ].join("\n");

    return {
      ...brand,
      socialLinks: {
        ...(brand.socialLinks ?? {}),
        twitter: brand.socialLinks?.twitter?.trim() || twitterUrl
      },
      additionalContext: existingContext ? `${existingContext}\n\n${xContext}` : xContext
    };
  } catch {
    return brand;
  }
}

function providerMatchesModel(provider: ModelProviderId, model: string) {
  if (provider === "openrouter") return model.startsWith("openrouter/");
  if (provider === "openai") return model.startsWith("openai/");
  if (provider === "minimax") return model.startsWith("minimax/");
  if (provider === "moonshot") return model.startsWith("moonshot/");
  return model.startsWith("nvidia/");
}

function validateProviderApiKey(provider: ModelProviderId, apiKey: string): string | null {
  if (provider !== "openrouter") return null;

  if (apiKey.startsWith("sk-cp-")) {
    return "OpenRouter Coding Plan keys (sk-cp-...) are not valid for model inference. Use a secret API key (sk-or-v1-...).";
  }
  if (!/^sk-or(?:-v1)?-/.test(apiKey)) {
    return "OpenRouter API key looks invalid. Use a secret key starting with sk-or-v1-.";
  }
  return null;
}

function makeSyntheticEmail(brandName: string) {
  const slug = brandName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `brand-${slug || "deploy"}-${Date.now()}@local.internal`;
}

async function getOrCreateDeployment(params: {
  deploymentId?: string;
  provider: ModelProviderId;
  model: string;
  telegramToken: string;
  modelApiKey: string;
  brandName: string;
  xUserKey?: string;
}): Promise<DeploymentRecord> {
  const encryptedTelegramToken = encrypt(params.telegramToken);
  const encryptedModelApiKey = encrypt(params.modelApiKey);

  if (params.deploymentId) {
    const existing = await getDeploymentById(params.deploymentId);
    if (existing) {
      return updateDeploymentById(existing.id, {
        modelProvider: params.provider,
        selectedModel: params.model as DeploymentRecord["selectedModel"],
        channel: "telegram",
        encryptedChannelPrimaryToken: encryptedTelegramToken,
        encryptedModelApiKey,
        status: "setup_started"
      });
    }
  }

  let user = null;
  const xUserKey = params.xUserKey?.trim() ?? "";
  if (xUserKey) {
    user = await getUserById(xUserKey);
    if (!user) {
      throw new Error("Connected X session was not found. Connect X again before deploying.");
    }
  }

  if (!user) {
    user = await upsertUser({
      email: makeSyntheticEmail(params.brandName),
      name: `${params.brandName} Bot`,
      photoURL: null
    });
  }

  return createDeployment({
    userId: user.id,
    plan: "starter",
    modelProvider: params.provider,
    selectedModel: params.model as DeploymentRecord["selectedModel"],
    channel: "telegram",
    encryptedChannelPrimaryToken: encryptedTelegramToken,
    encryptedChannelSecondaryToken: null,
    encryptedModelApiKey,
    billingInterval: null,
    paymentProvider: "mock",
    checkoutSessionId: null,
    subscriptionId: null,
    subscriptionStatus: "active",
    status: "setup_started"
  });
}

async function runDeepResearchInBackground(input: {
  deploymentId: string;
  brand: BrandConfig;
  baseContext?: ResearchContext;
}) {
  try {
    await updateDeploymentStatus(
      input.deploymentId,
      "setup_started",
      "Running deep brand research in background."
    );

    const deepResearch = await runDeepBrandResearch({
      deploymentId: input.deploymentId,
      brand: input.brand,
      sourcePolicy: "public_web_and_socials",
      baseContext: input.baseContext
    });

    await saveResearchArtifacts({
      deploymentId: input.deploymentId,
      phase: "deep",
      context: deepResearch.context
    });

    const enrichedConfig = await createBrandDeploymentConfig(input.brand, true, deepResearch.context);
    const enrichedFiles = prepareBrandFilesForDeployment(input.deploymentId, enrichedConfig);
    const refreshedRuntimeFiles = await refreshRuntimeBrandFiles(enrichedFiles);

    await Promise.all([
      saveDeploymentArtifact({
        deploymentId: input.deploymentId,
        kind: "skill",
        fileName: enrichedFiles.skillFileName,
        content: enrichedFiles.skillContent
      }),
      saveDeploymentArtifact({
        deploymentId: input.deploymentId,
        kind: "heartbeat",
        fileName: enrichedFiles.heartbeatFileName,
        content: enrichedFiles.heartbeatContent
      })
    ]);

    await updateDeploymentStatus(
      input.deploymentId,
      "setup_started",
      `Deep research complete (${Math.round(deepResearch.context.overallConfidence * 100)}% confidence). ${
        refreshedRuntimeFiles ? "Live SKILL/HEARTBEAT files refreshed." : "Artifacts refreshed in DB."
      }`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Deep research failed";
    await updateDeploymentStatus(
      input.deploymentId,
      "setup_started",
      `Deep research failed, keeping fast-pass artifacts: ${message}`
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const payload = parsed.data;
    const telegramToken = payload.telegram_bot_token.trim();
    const provider = payload.model_provider;
    const model = payload.model.trim();

    if (!telegramToken.includes(":")) {
      return NextResponse.json({ error: "Telegram bot token must include ':'" }, { status: 400 });
    }

    if (!providerMatchesModel(provider, model)) {
      return NextResponse.json(
        { error: "Selected model does not match the selected provider" },
        { status: 400 }
      );
    }

    const providedApiKey = payload.model_api_key?.trim();
    const modelApiKey = providedApiKey || (provider === "openrouter" ? env.PLATFORM_OPENROUTER_API_KEY?.trim() : "");
    if (!modelApiKey) {
      return NextResponse.json(
        {
          error:
            provider === "openrouter"
              ? "Model API key is required (or configure PLATFORM_OPENROUTER_API_KEY)."
              : "Model API key is required."
        },
        { status: 400 }
      );
    }

    const apiKeyValidationError = validateProviderApiKey(provider, modelApiKey);
    if (apiKeyValidationError) {
      return NextResponse.json({ error: apiKeyValidationError }, { status: 400 });
    }

    let brand = normalizeBrand(payload.brand);

    const deployment = await getOrCreateDeployment({
      deploymentId: payload.deploymentId,
      provider,
      model,
      telegramToken,
      modelApiKey,
      brandName: brand.name,
      xUserKey: payload.x_user_key?.trim()
    });

    brand = await enrichBrandWithXSignals(brand, deployment.userId);

    // If user connected X before deployment, attach it so this deployment has an explicit snapshot.
    const existingX = await getXConnectionByDeploymentId(deployment.id);
    if (!existingX) {
      const userX = await getXUserConnectionByUserId(deployment.userId);
      if (userX) {
        await saveXConnection({
          deploymentId: deployment.id,
          userId: deployment.userId,
          xUserId: userX.xUserId,
          username: userX.username,
          name: userX.name ?? null,
          encryptedAccessToken: userX.encryptedAccessToken,
          encryptedRefreshToken: userX.encryptedRefreshToken,
          tokenType: userX.tokenType,
          scope: userX.scope,
          expiresAt: userX.expiresAt
        });
      }
    }

    const researchEnabled = env.BRAND_RESEARCH_PIPELINE_ENABLED === "1";
    let fastResearchContext: ResearchContext | undefined;
    let fastResearchRunId: string | undefined;

    await updateDeploymentStatus(deployment.id, "setup_started", "Preparing brand intelligence.");

    if (researchEnabled) {
      try {
        await updateDeploymentStatus(
          deployment.id,
          "setup_started",
          "Running fast brand research from website and social links."
        );
        const fastResearch = await runFastBrandResearch({
          deploymentId: deployment.id,
          brand,
          sourcePolicy: "public_web_and_socials"
        });
        fastResearchRunId = fastResearch.run.id;
        fastResearchContext = fastResearch.context;

        await saveResearchArtifacts({
          deploymentId: deployment.id,
          phase: "fast",
          context: fastResearch.context
        });

        await updateDeploymentStatus(
          deployment.id,
          "setup_started",
          `Fast research complete (${Math.round(fastResearch.context.overallConfidence * 100)}% confidence).`
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Fast research failed";
        await updateDeploymentStatus(
          deployment.id,
          "setup_started",
          `Fast research unavailable, continuing with brand form inputs only: ${message}`
        );
      }
    }

    await updateDeploymentStatus(
      deployment.id,
      "setup_started",
      "Generating brand SKILL.md and HEARTBEAT.md."
    );

    const brandConfig = await createBrandDeploymentConfig(brand, true, fastResearchContext);
    const brandFiles = prepareBrandFilesForDeployment(deployment.id, brandConfig);

    await saveDeploymentArtifact({
      deploymentId: deployment.id,
      kind: "skill",
      fileName: brandFiles.skillFileName,
      content: brandFiles.skillContent
    });
    await saveDeploymentArtifact({
      deploymentId: deployment.id,
      kind: "heartbeat",
      fileName: brandFiles.heartbeatFileName,
      content: brandFiles.heartbeatContent
    });

    await updateDeploymentStatus(
      deployment.id,
      "setup_started",
      "Brand files generated. Sending deployment to runtime controller."
    );

    const result = await dispatchRuntimeDeployment({
      deploymentId: deployment.id,
      userId: deployment.userId,
      slotId: deployment.runtimeSlotId || `slot-${deployment.id}`,
      provider,
      model: model as DeploymentRecord["selectedModel"],
      channel: "telegram",
      channelPrimaryToken: telegramToken,
      modelApiKey,
      brandConfig: {
        skillContent: brandFiles.skillContent,
        skillFileName: brandFiles.skillFileName,
        heartbeatContent: brandFiles.heartbeatContent,
        heartbeatFileName: brandFiles.heartbeatFileName
      }
    });

    if (!result.accepted) {
      await updateDeploymentStatus(
        deployment.id,
        "setup_error",
        `Runtime dispatch failed: ${result.reason}`
      );
      return NextResponse.json(
        {
          error: result.reason,
          deploymentId: deployment.id
        },
        { status: 400 }
      );
    }

    await updateDeploymentStatus(
      deployment.id,
      "setup_started",
      `Runtime accepted deployment request. Job: ${result.jobId}`
    );

    if (researchEnabled) {
      void runDeepResearchInBackground({
        deploymentId: deployment.id,
        brand,
        baseContext: fastResearchContext
      });
    }

    return NextResponse.json({
      success: true,
      deploymentId: deployment.id,
      jobId: result.jobId,
      mode: result.mode,
      skillName: brandFiles.skillFileName,
      heartbeatFileName: brandFiles.heartbeatFileName,
      researchRunIdFast: fastResearchRunId ?? null,
      researchStatus: researchEnabled ? "running" : "disabled"
    });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "Deployment failed";
    const generationPrefix = "BRAND_FILE_GENERATION_FAILED:";
    const isGenerationFailure = rawMessage.startsWith(generationPrefix);
    const message = isGenerationFailure
      ? rawMessage.replace(generationPrefix, "").trim()
      : rawMessage;

    console.error("Brand deployment error:", error);
    return NextResponse.json(
      { error: message || "Deployment failed" },
      { status: isGenerationFailure ? 400 : 500 }
    );
  }
}
