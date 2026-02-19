import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createBrandDeploymentConfig, prepareBrandFilesForDeployment } from "@/lib/brand-deploy";
import { env } from "@/lib/env";
import { dispatchRuntimeDeployment } from "@/lib/runtime-executor";
import {
  createDeployment,
  getDeploymentById,
  getXConnectionByDeploymentId,
  getXUserConnectionByUserId,
  saveXConnection,
  updateDeploymentById,
  updateDeploymentStatus,
  upsertUser
} from "@/lib/store";
import { encrypt } from "@/lib/security";
import type { BrandConfig } from "@/lib/brand-types";
import type { DeploymentRecord, ModelProviderId } from "@/lib/types";

const providerSchema = z.enum(["openrouter", "openai", "moonshot", "nvidia"]);

const requestSchema = z.object({
  deploymentId: z.string().min(1).optional(),
  model_provider: providerSchema.default("openrouter"),
  model: z.string().min(1),
  telegram_bot_token: z.string().min(1),
  model_api_key: z.string().optional(),
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

function providerMatchesModel(provider: ModelProviderId, model: string) {
  if (provider === "openrouter") return model.startsWith("openrouter/");
  if (provider === "openai") return model.startsWith("openai/");
  if (provider === "moonshot") return model.startsWith("moonshot/");
  return model.startsWith("nvidia/");
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
}): Promise<DeploymentRecord> {
  const encryptedTelegramToken = encrypt(params.telegramToken);
  const encryptedModelApiKey = encrypt(params.modelApiKey);

  if (params.deploymentId) {
    const existing = await getDeploymentById(params.deploymentId);
    if (!existing) {
      throw new Error("Deployment not found for redeploy");
    }

    return updateDeploymentById(existing.id, {
      modelProvider: params.provider,
      selectedModel: params.model as DeploymentRecord["selectedModel"],
      channel: "telegram",
      encryptedChannelPrimaryToken: encryptedTelegramToken,
      encryptedModelApiKey,
      status: "setup_started"
    });
  }

  const user = await upsertUser({
    email: makeSyntheticEmail(params.brandName),
    name: `${params.brandName} Bot`,
    photoURL: null
  });

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

    const brand = normalizeBrand(payload.brand);

    const deployment = await getOrCreateDeployment({
      deploymentId: payload.deploymentId,
      provider,
      model,
      telegramToken,
      modelApiKey,
      brandName: brand.name
    });

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

    await updateDeploymentStatus(
      deployment.id,
      "setup_started",
      "Generating brand SKILL.md and HEARTBEAT.md."
    );

    const brandConfig = await createBrandDeploymentConfig(brand, true);
    const brandFiles = prepareBrandFilesForDeployment(deployment.id, brandConfig);

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

    return NextResponse.json({
      success: true,
      deploymentId: deployment.id,
      jobId: result.jobId,
      mode: result.mode,
      skillName: brandFiles.skillFileName,
      heartbeatFileName: brandFiles.heartbeatFileName
    });
  } catch (error) {
    console.error("Brand deployment error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Deployment failed" },
      { status: 500 }
    );
  }
}
