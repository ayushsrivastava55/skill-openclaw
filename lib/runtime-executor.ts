import { env } from "@/lib/env";
import type { ChannelId, ModelId } from "@/lib/types";

export type RuntimeDispatchInput = {
  deploymentId: string;
  userId: string;
  slotId: string;
  model: ModelId;
  channel: ChannelId;
  telegramToken: string;
  modelApiKey: string;
};

export type RuntimeDispatchResult =
  | { accepted: true; jobId: string; mode: "mock" | "remote-http" }
  | { accepted: false; reason: string };

function getCallbackUrl() {
  return env.RUNTIME_STATUS_CALLBACK_URL ?? `${env.NEXT_PUBLIC_APP_URL}/api/internal/runtime-status`;
}

export async function dispatchRuntimeDeployment(
  input: RuntimeDispatchInput
): Promise<RuntimeDispatchResult> {
  if (env.EXECUTION_MODE === "mock") {
    return {
      accepted: true,
      jobId: `mock-${input.deploymentId}`,
      mode: "mock"
    };
  }

  if (!env.RUNTIME_CONTROLLER_URL || !env.RUNTIME_CONTROLLER_TOKEN) {
    return {
      accepted: false,
      reason: "Execution mode is remote-http but runtime controller is not configured"
    };
  }

  const response = await fetch(`${env.RUNTIME_CONTROLLER_URL.replace(/\/$/, "")}/deploy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.RUNTIME_CONTROLLER_TOKEN}`
    },
    body: JSON.stringify({
      ...input,
      runtimeImage: env.OPENCLAW_RUNTIME_IMAGE,
      dmPolicy: "pairing",
      callbackUrl: getCallbackUrl(),
      callbackToken: env.RUNTIME_CALLBACK_TOKEN
    })
  });

  const payload = (await response.json().catch(() => ({}))) as {
    jobId?: string;
    error?: string;
  };

  if (!response.ok) {
    return {
      accepted: false,
      reason: payload.error ?? `Runtime controller responded with ${response.status}`
    };
  }

  return {
    accepted: true,
    jobId: payload.jobId ?? `remote-${input.deploymentId}`,
    mode: "remote-http"
  };
}
