import Stripe from "stripe";
import { env } from "@/lib/env";
import { onCheckoutCompleted, processDeploymentJob } from "@/lib/provisioning";
import { getStripe } from "@/lib/stripe";
import { addCredits, queueDeploymentJob } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const stripe = getStripe();
  if (!stripe || !env.STRIPE_WEBHOOK_SECRET) {
    const body = (await request.json()) as { sessionId?: string };
    if (!body.sessionId) {
      return Response.json({ error: "sessionId is required in mock mode" }, { status: 400 });
    }
    const result = onCheckoutCompleted(body.sessionId);
    if (!result.ok) {
      return Response.json({ error: result.reason }, { status: 404 });
    }
    return Response.json({ received: true, mode: "mock" });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return Response.json({ error: "Missing Stripe signature" }, { status: 400 });
  }

  const payload = await request.text();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(payload, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid signature";
    return Response.json({ error: message }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const result = onCheckoutCompleted(session.id);
    if (!result.ok) {
      const type = session.metadata?.type;
      const deploymentId = session.metadata?.deploymentId;
      if (type === "credits" && deploymentId) {
        const amount = Number(session.metadata?.amountUsd ?? "10");
        addCredits(deploymentId, Math.floor(amount * 1000));
      } else if (type === "deploy" && deploymentId) {
        queueDeploymentJob(deploymentId, session.id);
        setTimeout(() => {
          void processDeploymentJob(deploymentId).catch(() => {});
        }, 500);
      } else {
        return Response.json({ error: result.reason }, { status: 404 });
      }
    }
  }

  return Response.json({ received: true });
}
