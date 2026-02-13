import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-server";
import { getUserByEmail, listDeploymentsByUserId } from "@/lib/store";

export async function GET(request: Request) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const email = (searchParams.get("email") ?? authUser.email).toLowerCase().trim();
  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }
  if (email !== authUser.email) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const user = await getUserByEmail(email);
  if (!user) {
    return NextResponse.json({ ok: true, deployments: [] });
  }

  const deployments = await listDeploymentsByUserId(user.id);

  return NextResponse.json({
    ok: true,
    deployments: deployments.map((d) => ({
      id: d.id,
      plan: d.plan,
      channel: d.channel,
      status: d.status,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      subscriptionId: d.subscriptionId ?? null,
      subscriptionStatus: d.subscriptionStatus ?? null
    }))
  });
}

