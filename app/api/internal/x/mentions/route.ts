import { NextResponse } from "next/server";
import { isInternalRequestAuthorized } from "@/lib/internal-auth";
import { getValidXAccessTokenForDeployment } from "@/lib/x-service";
import { getXMentions } from "@/lib/x-api";

export async function GET(request: Request) {
  if (!isInternalRequestAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const deploymentId = searchParams.get("deploymentId")?.trim() ?? "";
  const sinceId = searchParams.get("sinceId")?.trim() || undefined;
  const maxResultsRaw = Number(searchParams.get("maxResults") ?? "20");

  if (!deploymentId) {
    return NextResponse.json({ error: "deploymentId is required" }, { status: 400 });
  }

  const maxResults = Number.isFinite(maxResultsRaw) ? maxResultsRaw : 20;

  try {
    const { connection, accessToken } = await getValidXAccessTokenForDeployment(deploymentId);
    const mentions = await getXMentions(accessToken, connection.xUserId, {
      sinceId,
      maxResults
    });

    return NextResponse.json({
      ok: true,
      mentions
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch X mentions" },
      { status: 502 }
    );
  }
}
