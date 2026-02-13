import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-server";
import { getDeploymentById, getUserById } from "@/lib/store";
import { syncOpenRouterUsageForDeployment } from "@/lib/openrouter-usage";

export async function GET(request: Request) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const rowId = searchParams.get("rowId")?.trim();
  if (!rowId) {
    return NextResponse.json({ error: "rowId is required" }, { status: 400 });
  }

  const deployment = await getDeploymentById(rowId);
  if (!deployment) {
    return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
  }

  const owner = await getUserById(deployment.userId);
  if (!owner || owner.email.toLowerCase().trim() !== authUser.email) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let updated;
  try {
    updated = await syncOpenRouterUsageForDeployment(deployment.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to sync OpenRouter usage";
    return NextResponse.json({ error: message }, { status: 502 });
  }
  if (!updated) {
    return NextResponse.json(
      { error: "OpenRouter key not found yet. If you just paid, wait ~30 seconds and refresh." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    data: {
      limit_total: updated.limitTotal,
      limit_remaining: updated.limitRemaining,
      period_start: updated.periodStart,
      period_end: updated.periodEnd,
      updated_at: updated.updatedAt
    }
  });
}
