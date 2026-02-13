import { capturePayPalOrder } from "@/lib/paypal";
import { onCheckoutCompleted, startDeploymentAfterPayment } from "@/lib/provisioning";
import {
  addCredits,
  getCheckoutSession,
  getDeploymentById,
  getUserById,
  isPayPalOrderProcessed,
  markPayPalOrderProcessed
} from "@/lib/store";

type FinalizeInput = {
  orderId: string;
  authEmail?: string | null;
};

type FinalizeResult = {
  orderId: string;
  captureId?: string;
  type: "deploy" | "credits";
  deploymentId: string;
  idempotent?: boolean;
};

function parseCustomId(customId: string) {
  const parts = customId.split(":");
  if (parts.length < 3) {
    return null;
  }

  const [type, deploymentId, value] = parts;
  if (type === "deploy") {
    return {
      type: "deploy" as const,
      deploymentId,
      plan: value === "pro" ? ("pro" as const) : ("starter" as const)
    };
  }

  if (type === "credits") {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) {
      return null;
    }
    return {
      type: "credits" as const,
      deploymentId,
      amount
    };
  }

  return null;
}

export async function finalizePayPalOrder(input: FinalizeInput): Promise<FinalizeResult> {
  if (await isPayPalOrderProcessed(input.orderId)) {
    const checkout = await getCheckoutSession(input.orderId);
    if (checkout) {
      return {
        orderId: input.orderId,
        type: checkout.type,
        deploymentId: checkout.deploymentId,
        idempotent: true
      };
    }
    throw Object.assign(new Error("Order already processed"), { statusCode: 409 });
  }

  const checkout = await getCheckoutSession(input.orderId);
  if (input.authEmail && checkout) {
    const deployment = await getDeploymentById(checkout.deploymentId);
    const owner = deployment ? await getUserById(deployment.userId) : null;
    if (!owner || owner.email.toLowerCase().trim() !== input.authEmail.toLowerCase().trim()) {
      throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
    }
  }

  const captured = await capturePayPalOrder(input.orderId);
  if (captured.status !== "COMPLETED") {
    throw Object.assign(new Error(`PayPal order status is ${captured.status}, expected COMPLETED.`), {
      statusCode: 400
    });
  }

  if (checkout) {
    const result = await onCheckoutCompleted(input.orderId);
    if (!result.ok) {
      throw Object.assign(new Error(result.reason), { statusCode: 404 });
    }

    if (checkout.type === "deploy") {
      const deployment = await getDeploymentById(checkout.deploymentId);
      if (deployment?.plan === "pro") {
        await addCredits(deployment.id, 10_000);
      }
    }

    await markPayPalOrderProcessed(input.orderId);
    return {
      orderId: input.orderId,
      captureId: captured.captureId,
      type: checkout.type,
      deploymentId: checkout.deploymentId
    };
  }

  if (!captured.customId) {
    throw Object.assign(new Error("Order metadata missing"), { statusCode: 404 });
  }

  const custom = parseCustomId(captured.customId);
  if (!custom) {
    throw Object.assign(new Error("Invalid order metadata"), { statusCode: 400 });
  }

  if (custom.type === "deploy") {
    startDeploymentAfterPayment(custom.deploymentId, input.orderId);
    if (custom.plan === "pro") {
      await addCredits(custom.deploymentId, 10_000);
    }
  } else {
    await addCredits(custom.deploymentId, Math.floor(custom.amount * 1000));
  }

  await markPayPalOrderProcessed(input.orderId);
  return {
    orderId: input.orderId,
    captureId: captured.captureId,
    type: custom.type,
    deploymentId: custom.deploymentId
  };
}
