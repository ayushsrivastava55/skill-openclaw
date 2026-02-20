import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-server";
import { getDeploymentById, getUserById } from "@/lib/store";

export async function GET(request: Request) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const deploymentId = (searchParams.get("deploymentId") ?? "").trim();
  if (!deploymentId) {
    return NextResponse.json({ error: "deploymentId is required" }, { status: 400 });
  }

  const deployment = await getDeploymentById(deploymentId);
  if (!deployment) {
    return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
  }

  const owner = await getUserById(deployment.userId);
  if (!owner || owner.email.toLowerCase().trim() !== authUser.email) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    ok: true,
    deployment: {
      id: deployment.id,
      plan: deployment.plan,
      channel: deployment.channel,
      status: deployment.status,
      createdAt: deployment.createdAt,
      updatedAt: deployment.updatedAt,
      subscriptionId: deployment.subscriptionId ?? null,
      subscriptionStatus: deployment.subscriptionStatus ?? null
    }
  });
}
