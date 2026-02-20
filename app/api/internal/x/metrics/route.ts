import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { isInternalRequestAuthorized } from "@/lib/internal-auth";
import { getXActionMetrics } from "@/lib/store";

function parseWindowHours(raw: string | null) {
  const parsed = Number(raw ?? "24");
  if (!Number.isFinite(parsed)) return 24;
  return Math.max(1, Math.min(24 * 30, Math.floor(parsed)));
}

export async function GET(request: Request) {
  if (!isInternalRequestAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const deploymentId = searchParams.get("deploymentId")?.trim() ?? "";
  const windowHours = parseWindowHours(searchParams.get("windowHours"));

  if (!deploymentId) {
    return NextResponse.json({ error: "deploymentId is required" }, { status: 400 });
  }

  try {
    const metrics = await getXActionMetrics(deploymentId, windowHours);
    return NextResponse.json({
      ok: true,
      metrics: {
        ...metrics,
        guardrails: {
          postCooldownMinutes: 0,
          replyCooldownMinutes: 0,
          dedupeWindowHours: env.X_CONTENT_DEDUPE_WINDOW_HOURS,
          replyThreadUserLimit: env.X_REPLY_THREAD_USER_LIMIT,
          postCooldownSecondsRemaining: 0,
          replyCooldownSecondsRemaining: 0
        }
      }
    });
  } catch (error) {
    console.error("[internal/x/metrics] failed", {
      deploymentId,
      windowHours,
      error
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch X action metrics" },
      { status: 500 }
    );
  }
}
