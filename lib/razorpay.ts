import { env } from "@/lib/env";
import crypto from "crypto";

type RazorpayOrderResponse = {
  id: string;
  amount: number;
  currency: string;
  status: string;
};

type RazorpaySubscriptionResponse = {
  id: string;
  status: string;
};

function requireRazorpayConfig() {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw new Error("Razorpay is not configured");
  }
}

function getAuthHeader() {
  requireRazorpayConfig();
  const encoded = Buffer.from(
    `${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`,
    "utf8"
  ).toString("base64");
  return `Basic ${encoded}`;
}

export function isRazorpayConfigured() {
  return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}

export async function createRazorpayOrder(input: {
  amount: number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}) {
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      amount: input.amount,
      currency: input.currency,
      receipt: input.receipt,
      notes: input.notes ?? {}
    })
  });

  const payload = (await response.json().catch(() => ({}))) as Partial<RazorpayOrderResponse> & {
    error?: { description?: string };
  };
  if (!response.ok || !payload.id) {
    const reason = payload.error?.description ?? "unknown_error";
    throw new Error(`Razorpay create order failed (${response.status}): ${reason}`);
  }

  return payload as RazorpayOrderResponse;
}

export async function createRazorpaySubscription(input: {
  planId: string;
  totalCount: number;
  customerNotify?: 0 | 1;
  notes?: Record<string, string>;
}) {
  const response = await fetch("https://api.razorpay.com/v1/subscriptions", {
    method: "POST",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      plan_id: input.planId,
      total_count: input.totalCount,
      customer_notify: input.customerNotify ?? 1,
      notes: input.notes ?? {}
    })
  });

  const payload = (await response.json().catch(() => ({}))) as Partial<RazorpaySubscriptionResponse> & {
    error?: { description?: string };
  };
  if (!response.ok || !payload.id) {
    const reason = payload.error?.description ?? "unknown_error";
    throw new Error(`Razorpay create subscription failed (${response.status}): ${reason}`);
  }

  return payload as RazorpaySubscriptionResponse;
}

export function verifyRazorpayOrderSignature(input: {
  orderId: string;
  paymentId: string;
  signature: string;
}) {
  if (!env.RAZORPAY_KEY_SECRET) {
    throw new Error("Razorpay secret not configured");
  }
  const payload = `${input.orderId}|${input.paymentId}`;
  const expected = crypto.createHmac("sha256", env.RAZORPAY_KEY_SECRET).update(payload).digest("hex");
  return expected === input.signature;
}

export function verifyRazorpaySubscriptionSignature(input: {
  subscriptionId: string;
  paymentId: string;
  signature: string;
}) {
  if (!env.RAZORPAY_KEY_SECRET) {
    throw new Error("Razorpay secret not configured");
  }
  // Razorpay subscription signature uses payment_id|subscription_id.
  const payload = `${input.paymentId}|${input.subscriptionId}`;
  const expected = crypto.createHmac("sha256", env.RAZORPAY_KEY_SECRET).update(payload).digest("hex");
  return expected === input.signature;
}

export function verifyRazorpayWebhookSignature(input: { body: string; signature: string }) {
  if (!env.RAZORPAY_WEBHOOK_SECRET) {
    throw new Error("Razorpay webhook secret not configured");
  }
  const expected = crypto
    .createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET)
    .update(input.body)
    .digest("hex");
  return expected === input.signature;
}
