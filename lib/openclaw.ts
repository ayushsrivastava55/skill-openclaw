import { decrypt } from "@/lib/security";
import type { DeploymentRecord } from "@/lib/types";

export function buildOnboardCommand(deployment: DeploymentRecord, modelKey: string) {
  const primaryToken = decrypt(deployment.encryptedChannelPrimaryToken);
  return [
    "npx openclaw@latest onboard",
    "--provider openrouter",
    `--model ${deployment.selectedModel}`,
    `--api-key ${modelKey}`,
    `--channel ${deployment.channel}`,
    `--token ${primaryToken}`,
    "--dm-policy pairing"
  ].join(" ");
}

export function buildStartCommand() {
  return "npx openclaw@latest start --headless --daemon --host 0.0.0.0 --port 3001";
}
