import { env } from "@/lib/env";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

type CreateKeyInput = {
  name: string;
  limitUsd: number;
  limitReset: "monthly" | "daily" | "weekly";
};

type CreateKeyResult = {
  key: string;
  keyId?: string;
  keyHash?: string;
  name?: string;
  limit?: number;
  limit_remaining?: number;
};

type KeyUsageResult = {
  name?: string;
  limit?: number;
  limit_remaining?: number;
  usage?: number;
  usage_daily?: number;
  usage_monthly?: number;
  byok_usage?: number;
};

function requireProvisioningKey() {
  const key = env.OPENROUTER_PROVISIONING_KEY?.trim();
  if (!key) {
    throw new Error("OPENROUTER_PROVISIONING_KEY is not configured");
  }
  return key;
}

export async function createProvisionedKey(input: CreateKeyInput): Promise<CreateKeyResult> {
  const apiKey = requireProvisioningKey();

  const response = await fetch(`${OPENROUTER_BASE}/keys`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: input.name,
      limit: input.limitUsd,
      limit_reset: input.limitReset
    })
  });

  const payload = (await response.json().catch(() => ({}))) as {
    key?: string;
    id?: string;
    name?: string;
    limit?: number;
    limit_remaining?: number;
    data?: {
      key?: string;
      id?: string;
      name?: string;
      limit?: number;
      limit_remaining?: number;
      hash?: string;
      label?: string;
    };
    error?: string;
  };

  const data = (payload.data ?? payload) as {
    key?: string;
    id?: string;
    name?: string;
    limit?: number;
    limit_remaining?: number;
    hash?: string;
    label?: string;
  };

  // OpenRouter returns the secret `key` at the top-level, while metadata lives under `data`.
  // Accept either shape to avoid false-negative failures.
  const key = data?.key ?? payload.key;

  if (!response.ok || !key) {
    throw new Error(payload.error ?? "Failed to create OpenRouter key");
  }

  return {
    key,
    keyId: data.id ?? payload.id,
    keyHash: data.hash,
    name: data.name ?? payload.name ?? data.label,
    limit: data.limit ?? payload.limit,
    limit_remaining: data.limit_remaining ?? payload.limit_remaining
  };
}

export async function disableKey(hash: string) {
  const apiKey = requireProvisioningKey();
  const response = await fetch(`${OPENROUTER_BASE}/keys/${hash}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ disabled: true })
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? "Failed to disable OpenRouter key");
  }
}

export async function getKeyUsage(apiKey: string): Promise<KeyUsageResult> {
  const response = await fetch(`${OPENROUTER_BASE}/key`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    }
  });

  const raw = (await response.json().catch(() => ({}))) as
    | (KeyUsageResult & { error?: string })
    | { data?: KeyUsageResult; error?: string };

  const payload = ("data" in raw && raw.data ? raw.data : raw) as KeyUsageResult & { error?: string };
  if (!response.ok) {
    const error = (raw as { error?: string }).error ?? payload.error;
    throw new Error(error ?? "Failed to fetch OpenRouter usage");
  }
  return payload;
}
