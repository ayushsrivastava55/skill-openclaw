import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-server";
import type { CheckUserResponse } from "@/lib/types";
import { getDeploymentByUserId, getUserByEmail } from "@/lib/store";

export async function GET(request: Request) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email")?.toLowerCase().trim() ?? authUser.email;

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  if (email !== authUser.email) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const user = await getUserByEmail(email);
  if (!user) {
    const payload: CheckUserResponse = { exists: false };
    return NextResponse.json(payload);
  }

  const deployment = await getDeploymentByUserId(user.id);
  const payload: CheckUserResponse = {
    exists: Boolean(deployment),
    id: deployment?.id,
    deployment_status: deployment?.status,
    plan: deployment?.plan,
    channel: deployment?.channel,
    created_at: deployment?.createdAt,
    subscription_id: deployment?.subscriptionId ?? null,
    subscription_status: deployment?.subscriptionStatus ?? null
  };

  return NextResponse.json(payload);
}
