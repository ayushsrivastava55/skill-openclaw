import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { creditCheckoutSchema } from "@/lib/schemas";
import { makeId } from "@/lib/security";
import { getStripe } from "@/lib/stripe";
import { addCredits, getDeploymentById, saveCheckoutSession } from "@/lib/store";

export async function POST(request: Request) {
  const parsed = creditCheckoutSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const body = parsed.data;
  const deployment = getDeploymentById(body.rowId);
  if (!deployment) {
    return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
  }

  const stripe = getStripe();
  if (!stripe || !env.STRIPE_PRICE_CREDITS) {
    addCredits(deployment.id, Math.floor(body.amount * 1000));
    const url = `${env.NEXT_PUBLIC_APP_URL}/?credit_purchase=success`;
    return NextResponse.json({ url, mode: "mock" });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    success_url: `${env.NEXT_PUBLIC_APP_URL}/?credit_purchase=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.NEXT_PUBLIC_APP_URL}/?credit_purchase=cancelled`,
    line_items: [
      {
        price: env.STRIPE_PRICE_CREDITS,
        quantity: Math.max(1, Math.round(body.amount / 10))
      }
    ],
    metadata: {
      deploymentId: deployment.id,
      type: "credits",
      amountUsd: String(body.amount)
    }
  });

  saveCheckoutSession(session.id, {
    deploymentId: deployment.id,
    type: "credits",
    amount: body.amount
  });

  return NextResponse.json({ url: session.url ?? `${env.NEXT_PUBLIC_APP_URL}/?credit_purchase=success`, sessionId: session.id });
}
