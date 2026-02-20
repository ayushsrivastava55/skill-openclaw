import { z } from "zod";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { isInternalRequestAuthorized } from "@/lib/internal-auth";
import { getValidXAccessTokenForDeployment } from "@/lib/x-service";
import { createXTweet } from "@/lib/x-api";
import {
  appendXActionLog,
  hasSentXActionWithContentHash
} from "@/lib/store";
import { hashXText, sinceHoursIso } from "@/lib/x-guardrails";

const schema = z.object({
  deploymentId: z.string().min(1),
  text: z.string().min(1).max(280)
});

async function logActionSafe(input: Parameters<typeof appendXActionLog>[0]) {
  try {
    await appendXActionLog(input);
  } catch (error) {
    console.error("[internal/x/post] Failed to append action log:", error);
  }
}

export async function POST(request: Request) {
  if (!isInternalRequestAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const deploymentId = parsed.data.deploymentId;
  const text = parsed.data.text.trim();
  const contentHash = hashXText(text);

  const isDuplicate = await hasSentXActionWithContentHash(
    deploymentId,
    "post",
    contentHash,
    sinceHoursIso(env.X_CONTENT_DEDUPE_WINDOW_HOURS)
  );

  if (isDuplicate) {
    await logActionSafe({
      deploymentId,
      actionType: "post",
      status: "blocked",
      contentHash,
      content: text,
      reason: `duplicate_content_${env.X_CONTENT_DEDUPE_WINDOW_HOURS}h`
    });
    return NextResponse.json(
      {
        error: "Duplicate post blocked by dedupe guardrail"
      },
      { status: 409 }
    );
  }

  try {
    const { accessToken } = await getValidXAccessTokenForDeployment(deploymentId);
    const tweet = await createXTweet(accessToken, {
      text
    });

    await logActionSafe({
      deploymentId,
      actionType: "post",
      status: "sent",
      targetTweetId: tweet.id,
      contentHash,
      content: text,
      metadata: { tweetId: tweet.id }
    });

    return NextResponse.json({
      ok: true,
      tweet
    });
  } catch (error) {
    await logActionSafe({
      deploymentId,
      actionType: "post",
      status: "failed",
      contentHash,
      content: text,
      reason: error instanceof Error ? error.message : "post_failed"
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to publish X post" },
      { status: 502 }
    );
  }
}
