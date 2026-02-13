import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-server";
import { getDeploymentById, getUserById, listChatMessages } from "@/lib/store";

export async function GET(request: Request) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const deploymentId = (searchParams.get("deploymentId") ?? "").trim();
  const limitRaw = Number(searchParams.get("limit") ?? "50");

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

  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, limitRaw)) : 50;
  const messages = await listChatMessages(deployment.id, limit);

  return NextResponse.json({ ok: true, deploymentId: deployment.id, messages });
}

