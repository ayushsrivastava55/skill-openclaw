import { NextResponse } from "next/server";
import { finalizePayPalOrder } from "@/lib/paypal-finalize";
import { isPayPalConfigured } from "@/lib/paypal";
import { getSubscription } from "@/lib/paypal-subscriptions";
import { env } from "@/lib/env";
import { getDeploymentById, getDeploymentBySubscriptionId, updateDeploymentById } from "@/lib/store";
import { startDeploymentAfterPayment } from "@/lib/provisioning";

function buildSuccessUrl(type: "deploy" | "credits", extra?: string) {
  const params = new URLSearchParams();
  params.set("paypal", type === "credits" ? "credits_success" : "deploy_success");
  if (extra) {
    params.set("paypal_note", extra.slice(0, 160));
  }
  return `${env.NEXT_PUBLIC_APP_URL}/checkout/success?${params.toString()}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  const subscriptionId = searchParams.get("subscription_id") ?? searchParams.get("subscriptionId");
  const type = searchParams.get("type") === "credits" ? "credits" : "deploy";
  const deploymentIdParam = searchParams.get("deploymentId")?.trim() ?? "";

  if (!isPayPalConfigured()) {
    return NextResponse.redirect(`${env.NEXT_PUBLIC_APP_URL}/checkout/success?paypal=not_configured`);
  }

  // Subscription return flow (preferred for deploy).
  if (!token && subscriptionId) {
    try {
      const subscription = await getSubscription(subscriptionId);
      const status = (subscription.status ?? "").toLowerCase();

      const deploymentId =
        deploymentIdParam ||
        (subscriptionId ? (await getDeploymentBySubscriptionId(subscriptionId))?.id : "") ||
        (subscription.customId?.split(":")[1] ?? "");

      if (!deploymentId) {
        return NextResponse.redirect(buildSuccessUrl(type, "Subscription missing deployment metadata"));
      }

      const deployment = await getDeploymentById(deploymentId);
      if (!deployment) {
        return NextResponse.redirect(buildSuccessUrl(type, "Deployment not found for subscription"));
      }

      await updateDeploymentById(deploymentId, {
        subscriptionId,
        subscriptionStatus: status || "active"
      });

      // Kick off provisioning when the subscription is active. Webhook will still reconcile status and cancellations.
      if (status === "active") {
        startDeploymentAfterPayment(deploymentId, subscriptionId);
      }

      const paidAt = Date.now();
      return NextResponse.redirect(
        `${env.NEXT_PUBLIC_APP_URL}/checkout/success?type=deploy&deploymentId=${encodeURIComponent(deploymentId)}&captured=1&paidAt=${paidAt}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to finalize PayPal subscription";
      return NextResponse.redirect(buildSuccessUrl(type, message));
    }
  }

  if (!token) {
    return NextResponse.redirect(`${env.NEXT_PUBLIC_APP_URL}/checkout/success?paypal=missing_token`);
  }

  try {
    await finalizePayPalOrder({ orderId: token });
    return NextResponse.redirect(buildSuccessUrl(type));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to finalize PayPal order";
    return NextResponse.redirect(buildSuccessUrl(type, message));
  }
}
