import { NextResponse } from "next/server";
import type { CheckUserResponse } from "@/lib/types";
import { getDeploymentByUserId, getUserByEmail } from "@/lib/store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const user = getUserByEmail(email);
  if (!user) {
    const payload: CheckUserResponse = { exists: false };
    return NextResponse.json(payload);
  }

  const deployment = getDeploymentByUserId(user.id);
  const payload: CheckUserResponse = {
    exists: Boolean(deployment),
    id: deployment?.id,
    deployment_status: deployment?.status
  };

  return NextResponse.json(payload);
}
