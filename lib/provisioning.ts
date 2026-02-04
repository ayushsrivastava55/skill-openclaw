import { env } from "@/lib/env";
import { decrypt } from "@/lib/security";
import { dispatchRuntimeDeployment } from "@/lib/runtime-executor";
import {
  addCredits,
  getCheckoutSession,
  getDeploymentById,
  markSlotState,
  queueDeploymentJob,
  releaseWarmSlot,
  refillWarmPool,
  reserveWarmSlot,
  updateDeploymentStatus
} from "@/lib/store";

export function onCheckoutCompleted(sessionId: string) {
  const checkout = getCheckoutSession(sessionId);
  if (!checkout) {
    return { ok: false, reason: "Checkout session not found" };
  }

  if (checkout.type === "credits") {
    addCredits(checkout.deploymentId, Math.floor((checkout.amount ?? 10) * 1000));
    return { ok: true };
  }

  queueDeploymentJob(checkout.deploymentId, sessionId);
  setTimeout(() => {
    void processDeploymentJob(checkout.deploymentId).catch(() => {
      // Worker handles retries in production.
    });
  }, 500);
  return { ok: true };
}

export async function processDeploymentJob(deploymentId: string) {
  const deployment = getDeploymentById(deploymentId);
  if (!deployment) {
    throw new Error("Deployment not found for provisioning");
  }

  const slot = reserveWarmSlot(deployment.id);
  if (!slot) {
    updateDeploymentStatus(
      deployment.id,
      "setup_error",
      "Warm pool empty. Please retry shortly while slots are refilling."
    );
    refillWarmPool();
    return;
  }

  markSlotState(slot.id, "configuring");
  updateDeploymentStatus(deployment.id, "setup_started", "Claimed warm runtime slot.");

  const modelKey = deployment.encryptedModelApiKey
    ? decrypt(deployment.encryptedModelApiKey)
    : env.PLATFORM_OPENROUTER_API_KEY;

  if (!modelKey) {
    releaseWarmSlot(slot.id);
    updateDeploymentStatus(
      deployment.id,
      "setup_error",
      "No model API key available. Add platform key or provide user key."
    );
    return;
  }

  const dispatch = await dispatchRuntimeDeployment({
    deploymentId: deployment.id,
    userId: deployment.userId,
    slotId: slot.id,
    model: deployment.selectedModel,
    channel: deployment.channel,
    telegramToken: decrypt(deployment.encryptedTelegramToken),
    modelApiKey: modelKey
  });

  if (!dispatch.accepted) {
    releaseWarmSlot(slot.id);
    updateDeploymentStatus(
      deployment.id,
      "setup_error",
      `Runtime dispatch failed: ${dispatch.reason}`
    );
    refillWarmPool();
    return;
  }

  if (env.EXECUTION_MODE === "mock") {
    updateDeploymentStatus(deployment.id, "setup_complete", "Mock runtime started in warm slot.");
    updateDeploymentStatus(
      deployment.id,
      "telegram_pairing_started",
      "Open Telegram and send first message to your bot."
    );

    markSlotState(slot.id, "active");
    updateDeploymentStatus(
      deployment.id,
      "telegram_pairing_complete",
      `Mock deployment ready (${dispatch.jobId}).`
    );
    refillWarmPool();
    return;
  }

  updateDeploymentStatus(
    deployment.id,
    "setup_started",
    `Runtime accepted by remote controller. Job: ${dispatch.jobId}`
  );
}
