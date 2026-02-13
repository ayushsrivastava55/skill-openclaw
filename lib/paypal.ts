import { env } from "@/lib/env";

type PayPalAccessTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  error?: string;
  error_description?: string;
};

type PayPalOrderCreateResponse = {
  id: string;
  status: string;
  links?: Array<{ rel: string; href: string; method: string }>;
  name?: string;
  message?: string;
  details?: Array<{ issue?: string; description?: string }>;
};

type PayPalOrderCaptureResponse = {
  id: string;
  status: string;
  name?: string;
  message?: string;
  details?: Array<{ issue?: string; description?: string }>;
  purchase_units?: Array<{
    custom_id?: string;
    payments?: {
      captures?: Array<{
        id: string;
        status: string;
      }>;
    };
  }>;
};

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

  const payload = (await response.json().catch(() => ({}))) as Partial<PayPalAccessTokenResponse>;
  if (!response.ok || !payload.access_token) {
    const reason = payload.error_description || payload.error || "unknown_error";
    throw new Error(`PayPal token request failed (${response.status}): ${reason}`);
  }

  return payload.access_token;
}

export function isPayPalConfigured() {
  return Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET);
}

export async function createPayPalOrder(input: {
  amountUsd: string;
  description: string;
  customId: string;
  returnUrl: string;
  cancelUrl: string;
}) {
  const accessToken = await getAccessToken();

  const response = await fetch(`${getPayPalBaseUrl()}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: "USD",
            value: input.amountUsd
          },
          description: input.description,
          custom_id: input.customId
        }
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "ClawPilot",
            user_action: "PAY_NOW",
            shipping_preference: "NO_SHIPPING",
            return_url: input.returnUrl,
            cancel_url: input.cancelUrl
          }
        }
      }
    })
  });

  const payload = (await response.json().catch(() => ({}))) as PayPalOrderCreateResponse;
  if (!response.ok || !payload.id) {
    const details = payload.details?.map((detail) => detail.issue || detail.description).filter(Boolean).join("; ");
    const reason = payload.message || payload.name || details || "unknown_error";
    throw new Error(`PayPal create order failed (${response.status}): ${reason}`);
  }

  const approveUrl =
    payload.links?.find((link) => link.rel === "approve")?.href ??
    payload.links?.find((link) => link.rel === "payer-action")?.href;
  if (!approveUrl) {
    const rels = payload.links?.map((link) => link.rel).join(", ") || "none";
    throw new Error(`PayPal create order did not return an approval URL (rels: ${rels})`);
  }

  return {
    orderId: payload.id,
    approveUrl
  };
}

export async function capturePayPalOrder(orderId: string) {
  const accessToken = await getAccessToken();

  const response = await fetch(`${getPayPalBaseUrl()}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: "{}"
  });

  const payload = (await response.json().catch(() => ({}))) as PayPalOrderCaptureResponse;
  if (!response.ok || !payload.id) {
    const details = payload.details?.map((detail) => detail.issue || detail.description).filter(Boolean).join("; ");
    const reason = payload.message || payload.name || details || "unknown_error";
    throw new Error(`PayPal capture failed (${response.status}): ${reason}`);
  }

  const customId = payload.purchase_units?.[0]?.custom_id;
  const captureId = payload.purchase_units?.[0]?.payments?.captures?.[0]?.id;

  return {
    orderId: payload.id,
    status: payload.status,
    customId,
    captureId
  };
}
