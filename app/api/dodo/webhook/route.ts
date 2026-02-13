import { NextResponse } from "next/server";
import { verifyDodoWebhookSignature } from "@/lib/dodo";
import {
  getDeploymentByCheckoutSessionId,
  getDeploymentById,
  getDeploymentBySubscriptionId,
  isDodoEventProcessed,
  markDodoEventProcessed,
  updateDeploymentById,
  updateDeploymentStatus
} from "@/lib/store";
import { startDeploymentAfterPayment } from "@/lib/provisioning";

type DodoWebhookEnvelope = {
  business_id?: string;
  type?: string;
  timestamp?: number;
  data?: Record<string, unknown>;
};

function normalizeStr(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getMetadataDeploymentId(data: Record<string, unknown>) {
  const meta = data.metadata;
  if (!meta || typeof meta !== "object") return "";
  const deploymentId = (meta as Record<string, unknown>).deploymentId;
  return normalizeStr(deploymentId);
}

export async function POST(request: Request) {
  const body = await request.text();

  const webhookId = request.headers.get("webhook-id") ?? "";
  const webhookTimestamp = request.headers.get("webhook-timestamp") ?? "";
  const webhookSignature = request.headers.get("webhook-signature") ?? "";

  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return NextResponse.json({ error: "Missing webhook headers" }, { status: 400 });
  }

  let verified = false;
  try {
    verified = verifyDodoWebhookSignature({
      webhookId,
      webhookTimestamp,
      webhookSignature,
      body
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook verification failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (!verified) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  if (await isDodoEventProcessed(webhookId)) {
    return NextResponse.json({ ok: true, idempotent: true });
  }

  const event = JSON.parse(body) as DodoWebhookEnvelope;
  const eventType = normalizeStr(event.type).toLowerCase();
  const data = (event.data ?? {}) as Record<string, unknown>;

  const metaDeploymentId = getMetadataDeploymentId(data);
  const checkoutSessionId = normalizeStr(data.checkout_session_id);
  const subscriptionId = normalizeStr(data.subscription_id);
  const status = normalizeStr(data.status).toLowerCase();

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      at: "dodo.webhook",
      webhookId,
      eventType,
      status: status || null,
      deploymentId: metaDeploymentId || null,
      checkoutSessionId: checkoutSessionId || null,
      subscriptionId: subscriptionId || null
    })
  );

  const deployment =
    (metaDeploymentId ? await getDeploymentById(metaDeploymentId) : null) ||
    (checkoutSessionId ? await getDeploymentByCheckoutSessionId(checkoutSessionId) : null) ||
    (subscriptionId ? await getDeploymentBySubscriptionId(subscriptionId) : null);

  if (!deployment) {
    await markDodoEventProcessed(webhookId);
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Keep a generic subscription status snapshot for gating.
  if (eventType.startsWith("subscription.")) {
    const next = status || eventType.split(".")[1] || "";
    await updateDeploymentById(deployment.id, {
      paymentProvider: "dodo",
      subscriptionId: subscriptionId || deployment.subscriptionId || null,
      subscriptionStatus: next || deployment.subscriptionStatus || null
    });

    // For cancelled subscriptions we do not attempt to kill the runtime here; we only prevent future redeploys.
    if (next === "cancelled" || next === "failed" || next === "on_hold") {
      await updateDeploymentStatus(deployment.id, "setup_error", "Subscription is not active. Please re-subscribe.");
    }
  }

  // Payment succeeded is the safest trigger to provision.
  if (eventType === "payment.succeeded") {
    await updateDeploymentById(deployment.id, {
      paymentProvider: "dodo",
      checkoutSessionId: checkoutSessionId || deployment.checkoutSessionId || null,
      subscriptionId: subscriptionId || deployment.subscriptionId || null,
      subscriptionStatus: "active"
    });

    // Avoid double-start if return route already started provisioning.
    const refreshed = await getDeploymentById(deployment.id);
    if (refreshed && !refreshed.runtimeSlotId) {
      await updateDeploymentStatus(deployment.id, "setup_started", "Payment confirmed. Provisioning your bot...");
      startDeploymentAfterPayment(deployment.id, subscriptionId || checkoutSessionId || webhookId);
    }
  }

  if (eventType === "payment.failed" || eventType === "payment.canceled" || eventType === "payment.cancelled") {
    await updateDeploymentById(deployment.id, {
      paymentProvider: "dodo",
      checkoutSessionId: checkoutSessionId || deployment.checkoutSessionId || null,
      subscriptionId: subscriptionId || deployment.subscriptionId || null,
      subscriptionStatus: "failed"
    });
    await updateDeploymentStatus(deployment.id, "setup_error", "Payment failed. Please retry checkout.");
  }

  await markDodoEventProcessed(webhookId);
  return NextResponse.json({ ok: true });
}
