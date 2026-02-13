import crypto from "crypto";
import { env } from "@/lib/env";

type DodoCreateCheckoutSessionResponse = {
  session_id: string;
  checkout_url: string;
};

export type DodoCheckoutSession = {
  // Dodo "Get Checkout Session" response uses `id` (not `session_id`).
  id: string;
  created_at?: string | null;
  customer_email?: string | null;
  customer_name?: string | null;
  payment_id?: string | null;
  payment_status?: string | null;
};

function getDodoBaseUrl() {
  // Per Dodo docs.
  return env.DODO_PAYMENTS_ENV === "live" ? "https://live.dodopayments.com" : "https://test.dodopayments.com";
}

function requireDodoApiKey() {
  if (!env.DODO_PAYMENTS_API_KEY) {
    throw new Error("Dodo Payments is not configured");
  }
  return env.DODO_PAYMENTS_API_KEY;
}

export function isDodoConfigured() {
  return Boolean(
    env.DODO_PAYMENTS_API_KEY &&
      env.DODO_PRODUCT_STARTER_MONTHLY &&
      env.DODO_PRODUCT_STARTER_YEARLY &&
      env.DODO_PRODUCT_PRO_MONTHLY &&
      env.DODO_PRODUCT_PRO_YEARLY
  );
}

async function dodoFetch(path: string, init?: RequestInit) {
  const key = requireDodoApiKey();
  const url = `${getDodoBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
}

export async function createDodoCheckoutSession(input: {
  productId: string;
  returnUrl: string;
  customer: { name: string; email: string };
  metadata: Record<string, string>;
}): Promise<{ sessionId: string; checkoutUrl: string }> {
  const response = await dodoFetch("/checkouts", {
    method: "POST",
    body: JSON.stringify({
      product_cart: [{ product_id: input.productId, quantity: 1 }],
      customer: {
        name: input.customer.name,
        email: input.customer.email
      },
      metadata: input.metadata,
      return_url: input.returnUrl,
      // Let Dodo collect country (and zip when required) to reduce mandate/compliance failures.
      // This also improves the odds of showing region-specific payment methods (e.g. UPI).
      minimal_address: true,
      // In test mode, force a 3DS flow when possible so mandate authentication is exercised.
      // In live mode we defer to the merchant dashboard settings unless explicitly overridden later.
      force_3ds: env.DODO_PAYMENTS_ENV === "test" ? true : undefined,
      // Only effective if Adaptive Pricing is enabled for the business.
      billing_currency: (env.DODO_BILLING_CURRENCY || "USD").toUpperCase()
    })
  });

  const payload = (await response.json().catch(() => ({}))) as Partial<DodoCreateCheckoutSessionResponse> & {
    code?: string;
    error?: { message?: string; code?: string } | string;
    message?: string;
  };

  if (!response.ok || !payload.session_id || !payload.checkout_url) {
    const topCode = String(payload.code || "").trim();
    const errCode =
      typeof payload.error === "object" && payload.error && "code" in payload.error
        ? String((payload.error as { code?: string }).code || "").trim()
        : "";
    const code = (topCode || errCode).toUpperCase();
    const msg =
      typeof payload.error === "string"
        ? payload.error
        : payload.error?.message || payload.message || JSON.stringify(payload).slice(0, 400);

    // Common integration footguns with actionable guidance.
    if (response.status === 401) {
      throw new Error(
        `Dodo returned 401 unauthorized. This usually means your API key environment does not match DODO_PAYMENTS_ENV (test vs live), or the key is invalid.\nDodo message: ${msg}`
      );
    }
    if (response.status === 403 && code === "MERCHANT_NOT_LIVE") {
      throw new Error(
        `Dodo returned 403 (MERCHANT_NOT_LIVE): live payments are not enabled for this merchant.\nFix: switch to test mode (DODO_PAYMENTS_ENV=test + a test API key + test products), or complete Dodo merchant activation for live.\nDodo message: ${msg}`
      );
    }
    if (response.status === 403) {
      throw new Error(
        `Dodo returned 403 forbidden. Check that the API key has write access enabled and matches the environment.\nDodo message: ${msg}`
      );
    }
    const reason =
      msg;
    throw new Error(`Dodo create checkout failed (${response.status}): ${reason}`);
  }

  return { sessionId: payload.session_id, checkoutUrl: payload.checkout_url };
}

export async function getDodoCheckoutSession(sessionId: string): Promise<DodoCheckoutSession> {
  const response = await dodoFetch(`/checkouts/${encodeURIComponent(sessionId)}`, { method: "GET" });
  const payload = (await response.json().catch(() => ({}))) as Partial<DodoCheckoutSession> & {
    error?: { message?: string } | string;
    message?: string;
  };
  if (!response.ok || !payload.id) {
    const reason =
      typeof payload.error === "string"
        ? payload.error
        : payload.error?.message || payload.message || JSON.stringify(payload).slice(0, 400);
    throw new Error(`Dodo get checkout failed (${response.status}): ${reason}`);
  }
  return payload as DodoCheckoutSession;
}

function parseStandardWebhookSignatures(header: string): string[] {
  // Standard Webhooks format: "v1,<base64sig> v1,<base64sig2> ..."
  const parts = header.split(/\s+/g).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    // Accept either "v1,<sig>" or "v1=<sig>".
    if (part.startsWith("v1,")) out.push(part.slice("v1,".length));
    else if (part.startsWith("v1=")) out.push(part.slice("v1=".length));
    else {
      const [version, sig] = part.split(",", 2);
      if (version === "v1" && sig) out.push(sig);
    }
  }
  return out.map((s) => s.trim()).filter(Boolean);
}

function decodeStandardWebhookSecret(secret: string): Buffer[] {
  // Dodo docs call this a "Secret Key" and reference Standard Webhooks.
  // Different providers encode this differently, so accept multiple forms:
  // - raw secret (utf8)
  // - base64 secret
  // - whsec_<base64> style secret (standardwebhooks)
  const trimmed = secret.trim();
  const keys: Buffer[] = [];
  if (!trimmed) return keys;

  keys.push(Buffer.from(trimmed, "utf8"));

  const whsecPrefix = "whsec_";
  const maybeBase64 = trimmed.startsWith(whsecPrefix) ? trimmed.slice(whsecPrefix.length) : trimmed;
  if (/^[A-Za-z0-9+/=]+$/.test(maybeBase64) && maybeBase64.length >= 16) {
    try {
      keys.push(Buffer.from(maybeBase64, "base64"));
    } catch {
      // ignore
    }
  }

  // Deduplicate by hex.
  const seen = new Set<string>();
  return keys.filter((k) => {
    const id = k.toString("hex");
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function verifyDodoWebhookSignature(input: {
  webhookId: string;
  webhookTimestamp: string;
  webhookSignature: string;
  body: string;
}): boolean {
  const secret = String(env.DODO_PAYMENTS_WEBHOOK_SECRET || "").trim();
  if (!secret) {
    throw new Error("Dodo webhook secret is not configured");
  }

  const ts = Number(input.webhookTimestamp);
  // Reject obviously invalid timestamps.
  if (!Number.isFinite(ts) || ts <= 0) {
    return false;
  }
  // Replay protection: 10 minutes.
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - Math.floor(ts)) > 600) {
    return false;
  }

  const signingPayload = `${input.webhookId}.${input.webhookTimestamp}.${input.body}`;
  const candidates = parseStandardWebhookSignatures(input.webhookSignature);
  if (!candidates.length) return false;

  const keys = decodeStandardWebhookSecret(secret);
  if (!keys.length) return false;

  return keys.some((key) => {
    const expected = crypto.createHmac("sha256", key).update(signingPayload, "utf8").digest("base64");
    return candidates.some((candidate) => {
      const a = Buffer.from(candidate, "utf8");
      const b = Buffer.from(expected, "utf8");
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    });
  });
}
