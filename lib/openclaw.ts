import { decrypt } from "@/lib/security";
import type { DeploymentRecord } from "@/lib/types";

export function buildOnboardCommand(deployment: DeploymentRecord, modelKey: string) {
  const telegramToken = decrypt(deployment.encryptedTelegramToken);
  return [
    "npx openclaw@latest onboard",
    "--provider openrouter",
    `--model ${deployment.selectedModel}`,
    `--api-key ${modelKey}`,
    `--telegram ${telegramToken}`,
    "--dm-policy pairing"
  ].join(" ");
}

export function buildStartCommand() {
  return "npx openclaw@latest start --headless --daemon --host 0.0.0.0 --port 3001";
}
