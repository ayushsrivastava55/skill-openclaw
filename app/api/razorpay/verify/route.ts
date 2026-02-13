import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-server";
import { verifyRazorpayOrderSignature, verifyRazorpaySubscriptionSignature } from "@/lib/razorpay";
import {
  getDeploymentById,
  getUserById,
  isRazorpayPaymentProcessed,
  markRazorpayPaymentProcessed,
  updateDeploymentById
} from "@/lib/store";
import { onCheckoutCompleted, startDeploymentAfterPayment } from "@/lib/provisioning";

export async function POST(request: Request) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    deploymentId?: string;
    type?: "deploy" | "credits";
    razorpay_payment_id?: string;
    razorpay_order_id?: string;
    razorpay_subscription_id?: string;
    razorpay_signature?: string;
  };

  if (!body.deploymentId || !body.razorpay_payment_id || !body.razorpay_signature) {
    return NextResponse.json({ error: "Missing payment verification fields" }, { status: 400 });
  }

  const deployment = await getDeploymentById(body.deploymentId);
  if (!deployment) {
    return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
  }
  const owner = await getUserById(deployment.userId);
  if (!owner || owner.email.toLowerCase().trim() !== authUser.email) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const orderId = body.razorpay_order_id ?? "";
  const subscriptionId = body.razorpay_subscription_id ?? "";

  const verified = orderId
    ? verifyRazorpayOrderSignature({
        orderId,
        paymentId: body.razorpay_payment_id,
        signature: body.razorpay_signature
      })
    : subscriptionId
      ? verifyRazorpaySubscriptionSignature({
          subscriptionId,
          paymentId: body.razorpay_payment_id,
          signature: body.razorpay_signature
        })
      : false;

  if (!verified) {
    return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 });
  }

  if (await isRazorpayPaymentProcessed(body.razorpay_payment_id)) {
    return NextResponse.json({ ok: true, idempotent: true, deploymentId: deployment.id });
  }

  // Credits top-ups are orders; deployments are subscriptions.
  if ((body.type ?? "deploy") === "credits") {
    if (!orderId) {
      return NextResponse.json({ error: "Missing razorpay_order_id for credits payment" }, { status: 400 });
    }
    const result = await onCheckoutCompleted(orderId);
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }
  } else {
    // For subscriptions we do not depend on webhook delivery to kick off provisioning.
    // Webhooks still update subscription status and handle cancellations.
    if (subscriptionId) {
      await updateDeploymentById(deployment.id, {
        subscriptionId: subscriptionId || deployment.subscriptionId || null,
        subscriptionStatus: "active"
      });
    }
    startDeploymentAfterPayment(deployment.id, subscriptionId || body.razorpay_payment_id);
  }

  await markRazorpayPaymentProcessed(body.razorpay_payment_id);

  return NextResponse.json({ ok: true, deploymentId: deployment.id });
}
