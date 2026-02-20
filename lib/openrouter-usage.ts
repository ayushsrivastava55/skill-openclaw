import { decrypt } from "@/lib/security";
import { getKeyUsage } from "@/lib/openrouter";
import { ensureProvisionedOpenRouterKey } from "@/lib/openrouter-provisioning";
import { getDeploymentById, getOpenRouterKeyByDeploymentId, getUsage, upsertUsage } from "@/lib/store";

// Keep OpenRouter polling minimal to avoid rate limits.
const MIN_SYNC_INTERVAL_MS = 30_000;

export async function syncOpenRouterUsageForDeployment(deploymentId: string) {
  const deployment = await getDeploymentById(deploymentId);
  if (!deployment) {
    return null;
  }
  if ((deployment.modelProvider ?? "openrouter") !== "openrouter") {
    return null;
  }

  const existing = await getUsage(deploymentId);
  if (existing) {
    const ageMs = Date.now() - new Date(existing.updatedAt).getTime();
    if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < MIN_SYNC_INTERVAL_MS) {
      return existing;
    }
  }

  let openrouter = await getOpenRouterKeyByDeploymentId(deployment.id);
  let encryptedKey = openrouter?.encryptedKey ?? deployment.encryptedModelApiKey;

  // Self-heal Pro deployments that were provisioned with the platform key due to transient failures.
  // This ensures the dashboard can always show a credits balance for active subscriptions.
  if (!encryptedKey && deployment.plan === "pro" && deployment.subscriptionStatus === "active") {
    await ensureProvisionedOpenRouterKey(deployment);
    openrouter = await getOpenRouterKeyByDeploymentId(deployment.id);
    const refreshed = await getDeploymentById(deploymentId);
    encryptedKey = openrouter?.encryptedKey ?? refreshed?.encryptedModelApiKey ?? null;
  }

  if (!encryptedKey) return null;

  const apiKey = decrypt(encryptedKey);
  const usage = await getKeyUsage(apiKey);

  const limitTotal = usage.limit ?? 0;
  const limitRemaining = usage.limit_remaining ?? 0;

  return upsertUsage(deployment.id, {
    limitTotal,
    limitRemaining
  });
}
