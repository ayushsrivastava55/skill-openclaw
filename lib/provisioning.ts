import { env } from "@/lib/env";
import { ensureProvisionedOpenRouterKey } from "@/lib/openrouter-provisioning";
import { decrypt } from "@/lib/security";
import { dispatchRuntimeDeployment } from "@/lib/runtime-executor";
import {
  addCredits,
  getCheckoutSession,
  getDeploymentById,
  getOpenRouterKeyByDeploymentId,
  markSlotState,
  queueDeploymentJob,
  releaseWarmSlot,
  refillWarmPool,
  reserveWarmSlot,
  updateDeploymentStatus
} from "@/lib/store";

export async function onCheckoutCompleted(sessionId: string) {
  const checkout = await getCheckoutSession(sessionId);
  if (!checkout) {
    return { ok: false, reason: "Checkout session not found" };
  }

  if (checkout.type === "credits") {
    await addCredits(checkout.deploymentId, Math.floor((checkout.amount ?? 10) * 1000));
    return { ok: true };
  }

  startDeploymentAfterPayment(checkout.deploymentId, sessionId);
  return { ok: true };
}

export function startDeploymentAfterPayment(deploymentId: string, paymentReference?: string) {
  void queueDeploymentJob(deploymentId, paymentReference ?? `direct_${deploymentId}`);
  void processDeploymentJob(deploymentId).catch((error) => {
    const message = error instanceof Error ? error.message : "Unknown provisioning error";
    void updateDeploymentStatus(deploymentId, "setup_error", `Provisioning failed: ${message}`);
  });
}

export async function processDeploymentJob(deploymentId: string) {
  let deployment = await getDeploymentById(deploymentId);
  if (!deployment) {
    throw new Error("Deployment not found for provisioning");
  }

  if (deployment.subscriptionId && deployment.subscriptionStatus !== "active") {
    await updateDeploymentStatus(
      deployment.id,
      "setup_error",
      "Subscription not active. Please re-subscribe to provision your bot."
    );
    return;
  }

  // Pro plan: create an isolated OpenRouter key so we can track credits per-user.
  // Do this before dispatching the runtime so the bot uses the provisioned key from the start.
  if (deployment.plan === "pro" && !deployment.encryptedModelApiKey) {
    await updateDeploymentStatus(deployment.id, "setup_started", "Provisioning OpenRouter credits key...");
    await ensureProvisionedOpenRouterKey(deployment);
    const refreshed = await getDeploymentById(deploymentId);
    if (refreshed) deployment = refreshed;
  }

  const slot = await reserveWarmSlot(deployment.id);
  if (!slot) {
    await updateDeploymentStatus(
      deployment.id,
      "setup_error",
      "Warm pool empty. Please retry shortly while slots are refilling."
    );
    await refillWarmPool();
    return;
  }

  await markSlotState(slot.id, "configuring");
  await updateDeploymentStatus(deployment.id, "setup_started", "Claimed warm runtime slot.");

  const modelProvider = (deployment.modelProvider ?? "openrouter") as
    | "openrouter"
    | "openai"
    | "minimax"
    | "moonshot"
    | "nvidia";
  let encryptedModelKey = deployment.encryptedModelApiKey;
  if (!encryptedModelKey && deployment.plan === "pro") {
    const openrouter = await getOpenRouterKeyByDeploymentId(deployment.id);
    encryptedModelKey = openrouter?.encryptedKey ?? null;
  }
  if (deployment.plan === "pro" && !encryptedModelKey) {
    await releaseWarmSlot(slot.id);
    await updateDeploymentStatus(
      deployment.id,
      "setup_error",
      "Could not provision OpenRouter credits for Pro. Please retry or contact support."
    );
    return;
  }

  // Key selection:
  // - Starter: always BYOK (key is encryptedModelApiKey) and depends on provider.
  // - Pro: OpenRouter key is provisioned and stored in openrouterKeys.
  let modelKey: string | null = encryptedModelKey ? decrypt(encryptedModelKey) : null;
  if (!modelKey && modelProvider === "openrouter") {
    modelKey = env.PLATFORM_OPENROUTER_API_KEY ?? null;
  }

  if (!modelKey) {
    await releaseWarmSlot(slot.id);
    await updateDeploymentStatus(
      deployment.id,
      "setup_error",
      modelProvider === "openai"
        ? "No OpenAI API key available. Please add your OpenAI key and retry."
        : modelProvider === "minimax"
          ? "No MiniMax API key available. Please add your MiniMax key and retry."
        : modelProvider === "moonshot"
          ? "No Moonshot API key available. Please add your Moonshot key and retry."
          : "No model API key available. Add platform key or provide user key."
    );
    return;
  }

  if (
    deployment.plan === "starter" &&
    modelProvider !== "openrouter" &&
    modelProvider !== "openai" &&
    modelProvider !== "minimax" &&
    modelProvider !== "moonshot" &&
    modelProvider !== "nvidia"
  ) {
    await releaseWarmSlot(slot.id);
    await updateDeploymentStatus(deployment.id, "setup_error", "Unsupported model provider selected.");
    return;
  }
  if (deployment.plan === "starter" && modelProvider !== "openrouter" && !deployment.encryptedModelApiKey) {
    await releaseWarmSlot(slot.id);
    await updateDeploymentStatus(deployment.id, "setup_error", "Starter requires your API key.");
    return;
  }

  const dispatch = await dispatchRuntimeDeployment({
    deploymentId: deployment.id,
    userId: deployment.userId,
    slotId: slot.id,
    provider: modelProvider,
    model: deployment.selectedModel,
    channel: deployment.channel,
    channelPrimaryToken: decrypt(deployment.encryptedChannelPrimaryToken),
    channelSecondaryToken: deployment.encryptedChannelSecondaryToken
      ? decrypt(deployment.encryptedChannelSecondaryToken)
      : undefined,
    modelApiKey: modelKey
  });

  if (!dispatch.accepted) {
    await releaseWarmSlot(slot.id);
    await updateDeploymentStatus(
      deployment.id,
      "setup_error",
      `Runtime dispatch failed: ${dispatch.reason}`
    );
    await refillWarmPool();
    return;
  }

  if (env.EXECUTION_MODE === "mock") {
    await updateDeploymentStatus(deployment.id, "setup_complete", "Mock runtime started in warm slot.");
    await updateDeploymentStatus(
      deployment.id,
      "telegram_pairing_started",
      "Send the first message in your selected channel."
    );

    await markSlotState(slot.id, "active");
    await updateDeploymentStatus(
      deployment.id,
      "telegram_pairing_complete",
      `Mock deployment ready (${dispatch.jobId}).`
    );
    await refillWarmPool();
    return;
  }

  await updateDeploymentStatus(
    deployment.id,
    "setup_started",
    `Runtime accepted by remote controller. Job: ${dispatch.jobId}`
  );
}
