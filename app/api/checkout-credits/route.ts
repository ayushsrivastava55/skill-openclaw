import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-server";
import { env } from "@/lib/env";
import { createRazorpayOrder, isRazorpayConfigured } from "@/lib/razorpay";
import { creditCheckoutSchema } from "@/lib/schemas";
import { addCredits, getDeploymentById, getUserById, saveCheckoutSession } from "@/lib/store";

export async function POST(request: Request) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = creditCheckoutSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const body = parsed.data;
  const deployment = await getDeploymentById(body.rowId);
  if (!deployment) {
    return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
  }
  const owner = await getUserById(deployment.userId);
  if (!owner || owner.email.toLowerCase().trim() !== authUser.email) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isRazorpayConfigured()) {
    await addCredits(deployment.id, Math.floor(body.amount * 1000));
    const url = `${env.NEXT_PUBLIC_APP_URL}/checkout/success?type=credits&session_id=mock&deploymentId=${deployment.id}&captured=1`;
    return NextResponse.json({ url, mode: "mock" });
  }

  try {
    // We still store "credits" in USD terms internally, but charge INR for now.
    const usdToInr = 85;
    const amountInr = Math.round(body.amount * usdToInr);
    const order = await createRazorpayOrder({
      amount: amountInr * 100,
      currency: (env.RAZORPAY_CURRENCY || "INR").toUpperCase(),
      receipt: `credits_${deployment.id}_${Date.now()}`,
      notes: {
        deploymentId: deployment.id,
        type: "credits",
        amountUsd: body.amount.toFixed(2),
        amountInr: String(amountInr)
      }
    });

    await saveCheckoutSession(order.id, {
      deploymentId: deployment.id,
      type: "credits",
      amount: body.amount
    });

    return NextResponse.json({
      mode: "razorpay",
      keyId: env.RAZORPAY_KEY_ID,
      deploymentId: deployment.id,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create Razorpay order";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
