import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-server";
import { env } from "@/lib/env";
import { createDodoCheckoutSession, isDodoConfigured } from "@/lib/dodo";
import { isRazorpayConfigured, createRazorpaySubscription } from "@/lib/razorpay";
import { getRazorpayPlanIds } from "@/lib/razorpay-plans";
import { isPayPalConfigured } from "@/lib/paypal";
import { createSubscription as createPayPalSubscription } from "@/lib/paypal-subscriptions";
import { onCheckoutCompleted } from "@/lib/provisioning";
import { checkoutSchema } from "@/lib/schemas";
import { encrypt, makeId } from "@/lib/security";
import {
  createDeployment,
  saveCheckoutSession,
  updateDeploymentStatus,
  updateDeploymentById,
  upsertUsage,
  upsertUser
} from "@/lib/store";

export async function POST(request: Request) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = checkoutSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const body = parsed.data;
  if (authUser.email !== body.email.toLowerCase().trim()) {
    return NextResponse.json({ error: "Authenticated user does not match checkout email" }, { status: 403 });
  }

  const channelPrimaryToken =
    body.channel === "telegram"
      ? body.telegram_bot_token?.trim() ?? ""
      : body.channel === "discord"
        ? body.discord_bot_token?.trim() ?? ""
        : body.slack_bot_token?.trim() ?? "";
  const channelSecondaryToken =
    body.channel === "slack" ? body.slack_app_token?.trim() ?? null : null;

  const user = await upsertUser({
    email: body.email,
    name: body.name,
    photoURL: body.profile_picture ?? null
  });

  const deployment = await createDeployment({
    userId: user.id,
    plan: body.plan,
    modelProvider: body.model_provider ?? "openrouter",
    selectedModel: body.default_model,
    channel: body.channel,
    encryptedChannelPrimaryToken: encrypt(channelPrimaryToken),
    encryptedChannelSecondaryToken: channelSecondaryToken ? encrypt(channelSecondaryToken) : null,
    encryptedModelApiKey: body.model_api_key ? encrypt(body.model_api_key) : null,
    billingInterval: body.billing_interval,
    status: "setup_started"
  });
  // eslint-disable-next-line no-console
  console.log(`[checkout] created deployment ${deployment.id} for ${body.channel}/${body.plan}`);

  await upsertUsage(deployment.id);
  // Persist an event so the status stream is correct even if the app restarts
  // (and to prevent stale "ready" events from previous runs from short-circuiting the loader).
  await updateDeploymentStatus(deployment.id, "setup_started", "Checkout started. Complete payment to provision your bot.");

  // OpenRouter keys for Pro are provisioned after subscription activation (via webhook).

  // Prefer Dodo Payments when configured. Keep PayPal/Razorpay code paths dormant for easy switching.
  if (isDodoConfigured()) {
    const productId =
      body.plan === "pro"
        ? body.billing_interval === "yearly"
          ? env.DODO_PRODUCT_PRO_YEARLY
          : env.DODO_PRODUCT_PRO_MONTHLY
        : body.billing_interval === "yearly"
          ? env.DODO_PRODUCT_STARTER_YEARLY
          : env.DODO_PRODUCT_STARTER_MONTHLY;

    if (!productId) {
      return NextResponse.json({ error: "Dodo product IDs are not configured" }, { status: 500 });
    }

    try {
      const returnUrl = `${env.NEXT_PUBLIC_APP_URL}/api/dodo/return?type=deploy&deploymentId=${encodeURIComponent(deployment.id)}`;
      const session = await createDodoCheckoutSession({
        productId,
        returnUrl,
        customer: { name: user.name, email: user.email },
        metadata: {
          deploymentId: deployment.id,
          plan: body.plan,
          billingInterval: body.billing_interval,
          email: user.email
        }
      });

      await updateDeploymentById(deployment.id, {
        paymentProvider: "dodo",
        checkoutSessionId: session.sessionId,
        // Use checkout session id as a placeholder so subscription gating works everywhere
        // until Dodo sends the real subscription_id via return/webhook.
        subscriptionId: session.sessionId,
        subscriptionStatus: "created"
      });

      return NextResponse.json({
        mode: "dodo",
        url: session.checkoutUrl,
        deploymentId: deployment.id,
        sessionId: session.sessionId
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create Dodo checkout session";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  // PayPal subscriptions (fallback; kept for quick switching).
  if (isPayPalConfigured()) {
    const planId =
      body.plan === "pro"
        ? body.billing_interval === "yearly"
          ? env.PAYPAL_PLAN_PRO_YEARLY
          : env.PAYPAL_PLAN_PRO_MONTHLY
        : body.billing_interval === "yearly"
          ? env.PAYPAL_PLAN_STARTER_YEARLY
          : env.PAYPAL_PLAN_STARTER_MONTHLY;

    if (!planId) {
      return NextResponse.json({ error: "PayPal plan IDs are not configured" }, { status: 500 });
    }

    try {
      const returnUrl = `${env.NEXT_PUBLIC_APP_URL}/api/paypal/return?type=deploy&deploymentId=${encodeURIComponent(deployment.id)}`;
      const cancelUrl = `${env.NEXT_PUBLIC_APP_URL}/checkout/cancelled?type=deploy&deploymentId=${encodeURIComponent(deployment.id)}`;
      const customId = `deploy:${deployment.id}:${body.plan}`;

      const subscription = await createPayPalSubscription({
        planId,
        customId,
        returnUrl,
        cancelUrl
      });

      await updateDeploymentById(deployment.id, {
        paymentProvider: "paypal",
        subscriptionId: subscription.subscriptionId,
        subscriptionStatus: "created"
      });

      return NextResponse.json({
        mode: "paypal",
        url: subscription.approveUrl,
        deploymentId: deployment.id,
        subscriptionId: subscription.subscriptionId
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create PayPal subscription";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  if (!isRazorpayConfigured()) {
    const mockSessionId = makeId("mock_checkout");
    await saveCheckoutSession(mockSessionId, { deploymentId: deployment.id, type: "deploy" });
    void onCheckoutCompleted(mockSessionId);

    const url = `${env.NEXT_PUBLIC_APP_URL}/checkout/success?type=deploy&session_id=${mockSessionId}&deploymentId=${deployment.id}&captured=1`;
    return NextResponse.json({ url, sessionId: mockSessionId, mode: "mock" });
  }

  try {
    const plans = await getRazorpayPlanIds();
    const planId =
      body.plan === "pro"
        ? body.billing_interval === "yearly"
          ? plans.proYearly
          : plans.proMonthly
        : body.billing_interval === "yearly"
          ? plans.starterYearly
          : plans.starterMonthly;

    const subscription = await createRazorpaySubscription({
      planId,
      // Razorpay requires a fixed cycle count; keep it large so users can cancel anytime.
      totalCount: body.billing_interval === "yearly" ? 10 : 120,
      customerNotify: 1,
      notes: {
        deploymentId: deployment.id,
        plan: body.plan,
        billingInterval: body.billing_interval
      }
    });

    await updateDeploymentById(deployment.id, {
      paymentProvider: "razorpay",
      subscriptionId: subscription.id,
      subscriptionStatus: subscription.status || "created"
    });

    return NextResponse.json({
      mode: "razorpay",
      keyId: env.RAZORPAY_KEY_ID,
      deploymentId: deployment.id,
      subscriptionId: subscription.id
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create Razorpay subscription";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
