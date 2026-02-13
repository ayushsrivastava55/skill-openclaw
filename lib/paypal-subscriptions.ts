import { env } from "@/lib/env";

function getPayPalBaseUrl() {
  return env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

function requirePayPalConfig() {
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) {
    throw new Error("PayPal is not configured");
  }
}

async function getAccessToken() {
  requirePayPalConfig();

  const credentials = Buffer.from(
    `${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`,
    "utf8"
  ).toString("base64");

  const response = await fetch(`${getPayPalBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });

  const payload = (await response.json().catch(() => ({}))) as { access_token?: string; error?: string; error_description?: string };
  if (!response.ok || !payload.access_token) {
    const reason = payload.error_description || payload.error || "unknown_error";
    throw new Error(`PayPal token request failed (${response.status}): ${reason}`);
  }

  return payload.access_token;
}

export async function createSubscription(input: {
  planId: string;
  customId: string;
  returnUrl: string;
  cancelUrl: string;
}) {
  const accessToken = await getAccessToken();

  const response = await fetch(`${getPayPalBaseUrl()}/v1/billing/subscriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      plan_id: input.planId,
      custom_id: input.customId,
      application_context: {
        brand_name: "ClawPilot",
        user_action: "SUBSCRIBE_NOW",
        return_url: input.returnUrl,
        cancel_url: input.cancelUrl
      }
    })
  });

  const payload = (await response.json().catch(() => ({}))) as {
    id?: string;
    status?: string;
    links?: Array<{ rel: string; href: string }>;
    name?: string;
    message?: string;
    details?: Array<{ issue?: string; description?: string }>;
  };
  if (!response.ok || !payload.id) {
    const details = payload.details?.map((detail) => detail.issue || detail.description).filter(Boolean).join("; ");
    const reason = payload.message || payload.name || details || "unknown_error";
    throw new Error(`PayPal create subscription failed (${response.status}): ${reason}`);
  }

  const approveUrl = payload.links?.find((link) => link.rel === "approve")?.href;
  if (!approveUrl) {
    throw new Error("PayPal subscription did not return an approval URL");
  }

  return {
    subscriptionId: payload.id,
    approveUrl
  };
}

export async function getSubscription(subscriptionId: string): Promise<{
  subscriptionId: string;
  status: string;
  customId: string | null;
}> {
  const accessToken = await getAccessToken();

  const response = await fetch(`${getPayPalBaseUrl()}/v1/billing/subscriptions/${subscriptionId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    }
  });

  const payload = (await response.json().catch(() => ({}))) as {
    id?: string;
    status?: string;
    custom_id?: string;
    name?: string;
    message?: string;
    details?: Array<{ issue?: string; description?: string }>;
  };
  if (!response.ok || !payload.id) {
    const details = payload.details?.map((detail) => detail.issue || detail.description).filter(Boolean).join("; ");
    const reason = payload.message || payload.name || details || "unknown_error";
    throw new Error(`PayPal get subscription failed (${response.status}): ${reason}`);
  }

  return {
    subscriptionId: payload.id,
    status: payload.status ?? "UNKNOWN",
    customId: payload.custom_id ?? null
  };
}

export async function verifyWebhookSignature(input: {
  transmissionId: string;
  transmissionTime: string;
  transmissionSig: string;
  certUrl: string;
  authAlgo: string;
  webhookId: string;
  eventBody: string;
}) {
  const accessToken = await getAccessToken();

  const response = await fetch(`${getPayPalBaseUrl()}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      transmission_id: input.transmissionId,
      transmission_time: input.transmissionTime,
      cert_url: input.certUrl,
      auth_algo: input.authAlgo,
      transmission_sig: input.transmissionSig,
      webhook_id: input.webhookId,
      webhook_event: JSON.parse(input.eventBody)
    })
  });

  const payload = (await response.json().catch(() => ({}))) as { verification_status?: string };
  return payload.verification_status === "SUCCESS";
}
