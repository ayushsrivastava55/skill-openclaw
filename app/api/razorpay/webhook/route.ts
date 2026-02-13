import { NextResponse } from "next/server";
import { verifyRazorpayWebhookSignature } from "@/lib/razorpay";
import { ensureProvisionedOpenRouterKey } from "@/lib/openrouter-provisioning";
import { disableKey } from "@/lib/openrouter";
import {
  getDeploymentById,
  getDeploymentBySubscriptionId,
  getOpenRouterKeyByDeploymentId,
  isRazorpayPaymentProcessed,
  markRazorpayPaymentProcessed,
  updateDeploymentById
} from "@/lib/store";
import { onCheckoutCompleted } from "@/lib/provisioning";
import { stopRuntimeDeployment } from "@/lib/runtime-executor";

type RazorpayWebhookPayload = {
  event?: string;
  payload?: {
    payment?: { entity?: { id?: string; order_id?: string; notes?: Record<string, string> } };
    order?: { entity?: { id?: string; notes?: Record<string, string> } };
    subscription?: { entity?: { id?: string; status?: string; notes?: Record<string, string> } };
  };
};

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("x-razorpay-signature") ?? "";

  const verified = verifyRazorpayWebhookSignature({ body, signature });
  if (!verified) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  const payload = JSON.parse(body) as RazorpayWebhookPayload;
  const event = payload.event ?? "";

  if (event.startsWith("payment.") || event.startsWith("order.")) {
    const payment = payload.payload?.payment?.entity;
    const order = payload.payload?.order?.entity;
    const paymentId = payment?.id ?? "";
    const orderId = payment?.order_id ?? order?.id ?? "";

    if (!paymentId) {
      return NextResponse.json({ ok: true });
    }

    if (paymentId && (await isRazorpayPaymentProcessed(paymentId))) {
      return NextResponse.json({ ok: true, idempotent: true });
    }

    if (orderId) {
      await onCheckoutCompleted(orderId);
    }

    if (paymentId) {
      await markRazorpayPaymentProcessed(paymentId);
    }
    return NextResponse.json({ ok: true });
  }

  if (event.startsWith("subscription.")) {
    const subscription = payload.payload?.subscription?.entity;
    const subscriptionId = subscription?.id ?? "";
    const status = subscription?.status ?? "";
    const deploymentId =
      subscription?.notes?.deploymentId ??
      (subscriptionId ? (await getDeploymentBySubscriptionId(subscriptionId))?.id : undefined);

    if (!deploymentId) {
      return NextResponse.json({ ok: true });
    }

    const deployment = await getDeploymentById(deploymentId);
    if (!deployment) {
      return NextResponse.json({ ok: true });
    }

    await updateDeploymentById(deploymentId, {
      subscriptionId: subscriptionId || deployment.subscriptionId || null,
      subscriptionStatus: status || deployment.subscriptionStatus || null
    });

    if (status === "active") {
      await ensureProvisionedOpenRouterKey(deployment);
      return NextResponse.json({ ok: true });
    }

    if (status === "cancelled" || status === "halted" || status === "completed" || status === "paused") {
      const keyRecord = await getOpenRouterKeyByDeploymentId(deploymentId);
      if (keyRecord?.keyHash) {
        await disableKey(keyRecord.keyHash);
      }
      await stopRuntimeDeployment(deploymentId);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
