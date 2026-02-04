import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { onCheckoutCompleted } from "@/lib/provisioning";
import { checkoutSchema } from "@/lib/schemas";
import { encrypt, makeId } from "@/lib/security";
import { getStripe } from "@/lib/stripe";
import {
  createOrReplaceDeployment,
  saveCheckoutSession,
  upsertUsage,
  upsertUser
} from "@/lib/store";

export async function POST(request: Request) {
  const parsed = checkoutSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const body = parsed.data;
  const user = upsertUser({
    email: body.email,
    name: body.name,
    photoURL: body.profile_picture ?? null
  });

  const deployment = createOrReplaceDeployment({
    userId: user.id,
    selectedModel: body.default_model,
    channel: body.channel,
    encryptedTelegramToken: encrypt(body.telegram_bot_token),
    encryptedModelApiKey: body.model_api_key ? encrypt(body.model_api_key) : null,
    status: "setup_started"
  });

  upsertUsage(deployment.id);

  const stripe = getStripe();
  if (!stripe || !env.STRIPE_PRICE_DEPLOY) {
    const mockSessionId = makeId("mock_checkout");
    saveCheckoutSession(mockSessionId, { deploymentId: deployment.id, type: "deploy" });
    onCheckoutCompleted(mockSessionId);

    const url = `${env.NEXT_PUBLIC_APP_URL}/?checkout=success&session_id=${mockSessionId}`;
    return NextResponse.json({ url, sessionId: mockSessionId, mode: "mock" });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    success_url: `${env.NEXT_PUBLIC_APP_URL}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.NEXT_PUBLIC_APP_URL}/?checkout=cancelled`,
    customer_email: user.email,
    line_items: [
      {
        price: env.STRIPE_PRICE_DEPLOY,
        quantity: 1
      }
    ],
    metadata: {
      deploymentId: deployment.id,
      type: "deploy"
    }
  });

  saveCheckoutSession(session.id, { deploymentId: deployment.id, type: "deploy" });

  return NextResponse.json({ url: session.url, sessionId: session.id });
}
