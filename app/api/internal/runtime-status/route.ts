import { z } from "zod";
import { env } from "@/lib/env";
import { getDeploymentById, markSlotState, refillWarmPool, releaseWarmSlot, updateDeploymentStatus } from "@/lib/store";

const payloadSchema = z.object({
  deploymentId: z.string().min(1),
  status: z.enum([
    "setup_started",
    "setup_complete",
    "telegram_pairing_started",
    "telegram_pairing_complete",
    "setup_error",
    "pairing_error"
  ]),
  message: z.string().optional()
});

function isAuthorized(request: Request) {
  const auth = request.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : request.headers.get("x-runtime-token");
  return token === env.RUNTIME_CALLBACK_TOKEN;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = payloadSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { deploymentId, status, message } = parsed.data;
  const deployment = getDeploymentById(deploymentId);
  if (!deployment) {
    return Response.json({ error: "Deployment not found" }, { status: 404 });
  }

  if (deployment.runtimeSlotId) {
    if (status === "setup_error" || status === "pairing_error") {
      releaseWarmSlot(deployment.runtimeSlotId);
      refillWarmPool();
    }
    if (status === "telegram_pairing_complete") {
      markSlotState(deployment.runtimeSlotId, "active");
      refillWarmPool();
    }
  }

  updateDeploymentStatus(deploymentId, status, message);
  return Response.json({ ok: true });
}
