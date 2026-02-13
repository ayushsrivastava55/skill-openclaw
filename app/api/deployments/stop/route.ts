import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-server";
import { getDeploymentById, getUserById, updateDeploymentStatus } from "@/lib/store";
import { stopRuntimeDeployment } from "@/lib/runtime-executor";
import { z } from "zod";

const schema = z.object({
  deploymentId: z.string().min(1)
});

export async function POST(request: Request) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const deployment = await getDeploymentById(parsed.data.deploymentId);
  if (!deployment) {
    return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
  }

  const owner = await getUserById(deployment.userId);
  if (!owner || owner.email.toLowerCase().trim() !== authUser.email) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const stopped = await stopRuntimeDeployment(deployment.id);
  if (!stopped.ok) {
    return NextResponse.json({ error: stopped.reason ?? "Stop failed" }, { status: 502 });
  }

  await updateDeploymentStatus(deployment.id, "setup_started", "Bot stopped. Redeploy to start again.");
  return NextResponse.json({ ok: true });
}

