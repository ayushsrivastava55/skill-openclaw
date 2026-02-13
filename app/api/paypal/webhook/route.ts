import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/paypal-subscriptions";
import { env } from "@/lib/env";
import { getDeploymentById, getOpenRouterKeyByDeploymentId, updateDeploymentById } from "@/lib/store";
import { disableKey } from "@/lib/openrouter";
import { ensureProvisionedOpenRouterKey } from "@/lib/openrouter-provisioning";
import { stopRuntimeDeployment } from "@/lib/runtime-executor";

export async function POST(request: Request) {
  if (!env.PAYPAL_WEBHOOK_ID) {
    return NextResponse.json({ error: "PAYPAL_WEBHOOK_ID is not configured" }, { status: 500 });
  }

  const eventBody = await request.text();
  const transmissionId = request.headers.get("paypal-transmission-id") ?? "";
  const transmissionTime = request.headers.get("paypal-transmission-time") ?? "";
  const transmissionSig = request.headers.get("paypal-transmission-sig") ?? "";
  const certUrl = request.headers.get("paypal-cert-url") ?? "";
  const authAlgo = request.headers.get("paypal-auth-algo") ?? "";

  const verified = await verifyWebhookSignature({
    transmissionId,
    transmissionTime,
    transmissionSig,
    certUrl,
    authAlgo,
    webhookId: env.PAYPAL_WEBHOOK_ID,
    eventBody
  });

  if (!verified) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  const payload = JSON.parse(eventBody) as {
    event_type?: string;
    resource?: {
      id?: string;
      status?: string;
      custom_id?: string;
    };
  };

  const eventType = payload.event_type ?? "";
  const resource = payload.resource ?? {};
  const subscriptionId = resource.id ?? "";
  const customId = resource.custom_id ?? "";
  const deploymentId = customId.split(":")[1] ?? "";

  if (!deploymentId) {
    return NextResponse.json({ ok: true });
  }

  if (eventType === "BILLING.SUBSCRIPTION.ACTIVATED") {
    const deployment = await getDeploymentById(deploymentId);
    if (deployment) {
      await ensureProvisionedOpenRouterKey(deployment);
    }
    await updateDeploymentById(deploymentId, {
      subscriptionId: subscriptionId || null,
      subscriptionStatus: "active"
    });
    return NextResponse.json({ ok: true });
  }

  if (
    eventType === "BILLING.SUBSCRIPTION.CANCELLED" ||
    eventType === "BILLING.SUBSCRIPTION.SUSPENDED" ||
    eventType === "BILLING.SUBSCRIPTION.EXPIRED"
  ) {
    await updateDeploymentById(deploymentId, {
      subscriptionId: subscriptionId || null,
      subscriptionStatus: eventType.toLowerCase()
    });

    const keyRecord = await getOpenRouterKeyByDeploymentId(deploymentId);
    if (keyRecord?.keyHash) {
      await disableKey(keyRecord.keyHash);
    }

    await stopRuntimeDeployment(deploymentId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
