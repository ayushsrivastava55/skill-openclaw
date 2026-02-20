import type { DeploymentRecord } from "@/lib/types";
import { createProvisionedKey } from "@/lib/openrouter";
import { encrypt } from "@/lib/security";
import { env } from "@/lib/env";
import { getOpenRouterKeyByDeploymentId, saveOpenRouterKey, updateDeploymentById } from "@/lib/store";

export async function ensureProvisionedOpenRouterKey(deployment: DeploymentRecord): Promise<void> {
  if (deployment.plan !== "pro" || deployment.encryptedModelApiKey) {
    return;
  }

  const existing = await getOpenRouterKeyByDeploymentId(deployment.id);
  if (existing) {
    return;
  }

  const provisioned = await createProvisionedKey({
    name: `clawpilot_${deployment.id}`,
    limitUsd: env.OPENROUTER_PROVISIONING_LIMIT_USD,
    limitReset: "monthly"
  });
  const encryptedKey = encrypt(provisioned.key);

  await updateDeploymentById(deployment.id, { encryptedModelApiKey: encryptedKey });
  await saveOpenRouterKey({
    userId: deployment.userId,
    deploymentId: deployment.id,
    encryptedKey,
    keyId: provisioned.keyId,
    keyHash: provisioned.keyHash,
    limitUsd: provisioned.limit,
    limitRemaining: provisioned.limit_remaining
  });
}
