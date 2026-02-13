import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getDodoCheckoutSession } from "@/lib/dodo";
import { getDeploymentById, updateDeploymentById, updateDeploymentStatus } from "@/lib/store";
import { startDeploymentAfterPayment } from "@/lib/provisioning";

function pickSessionId(searchParams: URLSearchParams) {
  // Dodo may append a session identifier. Be tolerant to naming differences.
  return (
    searchParams.get("session_id") ||
    searchParams.get("checkout_session_id") ||
    searchParams.get("checkoutSessionId") ||
    searchParams.get("checkout_session") ||
    ""
  ).trim();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const deploymentId = (searchParams.get("deploymentId") || "").trim();
  const type = searchParams.get("type") === "credits" ? "credits" : "deploy";
  const sessionIdFromQuery = pickSessionId(searchParams);

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      at: "dodo.return",
      deploymentId: deploymentId || null,
      type,
      sessionId: sessionIdFromQuery || null
    })
  );

  if (type !== "deploy") {
    return NextResponse.redirect(`${env.NEXT_PUBLIC_APP_URL}/checkout/success?type=credits&captured=1`);
  }

  if (!deploymentId) {
    return NextResponse.redirect(`${env.NEXT_PUBLIC_APP_URL}/checkout/success?type=deploy&captured=1`);
  }

  const deployment = await getDeploymentById(deploymentId);
  if (!deployment) {
    return NextResponse.redirect(`${env.NEXT_PUBLIC_APP_URL}/checkout/success?type=deploy&captured=1`);
  }

  const paidAt = Date.now();

  const effectiveSessionId = (
    sessionIdFromQuery ||
    String(deployment.checkoutSessionId || "").trim() ||
    // We temporarily set subscriptionId = checkout session id for Dodo at checkout creation.
    String(deployment.subscriptionId || "").trim()
  ).trim();

  if (!effectiveSessionId) {
    // We can still show the loader; webhook will activate provisioning.
    await updateDeploymentStatus(
      deploymentId,
      "setup_started",
      "Payment submitted. Waiting for confirmation from the payment provider..."
    );
    return NextResponse.redirect(
      `${env.NEXT_PUBLIC_APP_URL}/checkout/success?type=deploy&deploymentId=${encodeURIComponent(deploymentId)}&captured=1&paidAt=${paidAt}`
    );
  }

  try {
    const checkout = await getDodoCheckoutSession(effectiveSessionId);
    const paymentStatus = String(checkout.payment_status || "").toLowerCase().trim();
    // Checkout session lookup does not reliably include subscription id; webhook will attach it.
    const subscriptionId = null;

    await updateDeploymentById(deploymentId, {
      paymentProvider: "dodo",
      checkoutSessionId: checkout.id || effectiveSessionId,
      subscriptionId: deployment.subscriptionId || effectiveSessionId,
      // Map to our internal values; provisioning gate only cares about "active".
      subscriptionStatus: paymentStatus === "succeeded" ? "active" : paymentStatus || deployment.subscriptionStatus || null
    });

    // Dodo may redirect back even when payment fails/cancels. Treat that as a cancelled checkout UX.
    if (paymentStatus && paymentStatus !== "succeeded" && paymentStatus !== "processing" && paymentStatus !== "pending") {
      await updateDeploymentStatus(
        deploymentId,
        "setup_error",
        `Payment ${paymentStatus}. Please retry checkout to provision your bot.`
      );
      return NextResponse.redirect(
        `${env.NEXT_PUBLIC_APP_URL}/checkout/cancelled?type=deploy&deploymentId=${encodeURIComponent(deploymentId)}&provider=dodo&status=${encodeURIComponent(paymentStatus)}`
      );
    }

    if (paymentStatus === "succeeded") {
      await updateDeploymentStatus(deploymentId, "setup_started", "Payment confirmed. Provisioning your bot...");
      // Avoid double-start if webhook already triggered provisioning.
      const refreshed = await getDeploymentById(deploymentId);
      if (refreshed && !refreshed.runtimeSlotId) {
        startDeploymentAfterPayment(deploymentId, subscriptionId || effectiveSessionId);
      }
    } else {
      await updateDeploymentStatus(
        deploymentId,
        "setup_started",
        "Payment processing. We will start your bot as soon as it is confirmed."
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payment processing. We will start your bot once confirmed.";
    await updateDeploymentStatus(deploymentId, "setup_started", message);
  }

  return NextResponse.redirect(
    `${env.NEXT_PUBLIC_APP_URL}/checkout/success?type=deploy&deploymentId=${encodeURIComponent(deploymentId)}&captured=1&paidAt=${paidAt}`
  );
}
