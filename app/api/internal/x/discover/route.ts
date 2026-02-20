import { NextResponse } from "next/server";
import { isInternalRequestAuthorized } from "@/lib/internal-auth";
import { searchRecentXTweets } from "@/lib/x-api";
import { getValidXAccessTokenForDeployment } from "@/lib/x-service";

function parseMaxResults(raw: string | null) {
  const parsed = Number(raw ?? "20");
  if (!Number.isFinite(parsed)) return 20;
  return Math.max(10, Math.min(100, Math.floor(parsed)));
}

function normalizeHandle(username: string | null | undefined) {
  return (username ?? "").replace(/^@+/, "").trim().toLowerCase();
}

function buildDefaultDiscoverQuery(username: string | null | undefined) {
  const handle = normalizeHandle(username);
  if (!handle) {
    return "(web3 OR crypto OR blockchain) -is:retweet";
  }
  return `(@${handle} OR "${handle}") -from:${handle} -is:retweet`;
}

function ensureDiscoverQuerySafety(query: string, username: string | null | undefined) {
  const handle = normalizeHandle(username);
  let normalized = query.trim();

  if (!/\-is:retweet\b/i.test(normalized)) {
    normalized = `${normalized} -is:retweet`;
  }

  if (handle && !new RegExp(`-from:${handle}\\b`, "i").test(normalized)) {
    normalized = `${normalized} -from:${handle}`;
  }

  return normalized.trim();
}

export async function GET(request: Request) {
  if (!isInternalRequestAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const deploymentId = searchParams.get("deploymentId")?.trim() ?? "";
  const query = searchParams.get("query")?.trim() ?? "";
  const sinceId = searchParams.get("sinceId")?.trim() || undefined;
  const startTime = searchParams.get("startTime")?.trim() || undefined;
  const maxResults = parseMaxResults(searchParams.get("maxResults"));

  if (!deploymentId) {
    return NextResponse.json({ error: "deploymentId is required" }, { status: 400 });
  }

  try {
    const { connection, accessToken } = await getValidXAccessTokenForDeployment(deploymentId);
    const rawQuery = query || buildDefaultDiscoverQuery(connection.username);
    const queryUsed = ensureDiscoverQuerySafety(rawQuery, connection.username);
    const results = await searchRecentXTweets(accessToken, {
      query: queryUsed,
      sinceId,
      startTime,
      maxResults
    });

    const ownUserId = connection.xUserId?.trim() ?? "";
    const tweets = Array.isArray((results as { data?: unknown }).data)
      ? ((results as { data: Array<Record<string, unknown>> }).data ?? [])
      : [];
    const filteredTweets =
      ownUserId.length > 0
        ? tweets.filter((tweet) => String(tweet.author_id ?? "") !== ownUserId)
        : tweets;
    const filteredCount = tweets.length - filteredTweets.length;

    return NextResponse.json({
      ok: true,
      query: queryUsed,
      results: {
        ...(results as Record<string, unknown>),
        data: filteredTweets,
        meta: {
          ...((results as { meta?: Record<string, unknown> }).meta ?? {}),
          result_count: filteredTweets.length,
          filtered_own_posts: filteredCount
        }
      }
    });
  } catch (error) {
    console.error("[internal/x/discover] failed", {
      deploymentId,
      query,
      sinceId,
      startTime,
      maxResults,
      error
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to discover X posts" },
      { status: 502 }
    );
  }
}
