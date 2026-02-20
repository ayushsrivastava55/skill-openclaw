import { z } from "zod";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { isInternalRequestAuthorized } from "@/lib/internal-auth";
import { getValidXAccessTokenForDeployment } from "@/lib/x-service";
import { createXTweet } from "@/lib/x-api";
import {
  appendXActionLog,
  countSentXRepliesForAuthorInConversation,
  hasSentXActionWithContentHash,
  hasSentXReplyToTweet
} from "@/lib/store";
import { hashXText, sinceHoursIso } from "@/lib/x-guardrails";

const schema = z.object({
  deploymentId: z.string().min(1),
  inReplyToTweetId: z.string().min(1),
  text: z.string().min(1).max(280),
  targetAuthorId: z.string().min(1).optional(),
  conversationId: z.string().min(1).optional()
});

async function logActionSafe(input: Parameters<typeof appendXActionLog>[0]) {
  try {
    await appendXActionLog(input);
  } catch (error) {
    console.error("[internal/x/reply] Failed to append action log:", error);
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
  const inReplyToTweetId = parsed.data.inReplyToTweetId;
  const text = parsed.data.text.trim();
  const targetAuthorId = parsed.data.targetAuthorId?.trim() || undefined;
  const conversationId = parsed.data.conversationId?.trim() || undefined;
  const contentHash = hashXText(text);

  const threadRepliesPromise =
    targetAuthorId && conversationId
      ? countSentXRepliesForAuthorInConversation(deploymentId, targetAuthorId, conversationId)
      : Promise.resolve(0);

  const [isDuplicateContent, hasTweetReply, threadReplies] = await Promise.all([
    hasSentXActionWithContentHash(
      deploymentId,
      "reply",
      contentHash,
      sinceHoursIso(env.X_CONTENT_DEDUPE_WINDOW_HOURS)
    ),
    hasSentXReplyToTweet(deploymentId, inReplyToTweetId),
    threadRepliesPromise
  ]);

  if (hasTweetReply) {
    await logActionSafe({
      deploymentId,
      actionType: "reply",
      status: "blocked",
      targetTweetId: inReplyToTweetId,
      targetAuthorId,
      conversationId,
      contentHash,
      content: text,
      reason: "already_replied_to_tweet"
    });
    return NextResponse.json(
      {
        error: "Already replied to this tweet"
      },
      { status: 409 }
    );
  }

  if (targetAuthorId && conversationId && threadReplies >= env.X_REPLY_THREAD_USER_LIMIT) {
    await logActionSafe({
      deploymentId,
      actionType: "reply",
      status: "blocked",
      targetTweetId: inReplyToTweetId,
      targetAuthorId,
      conversationId,
      contentHash,
      content: text,
      reason: `thread_user_limit_${env.X_REPLY_THREAD_USER_LIMIT}`
    });
    return NextResponse.json(
      {
        error: "Thread reply limit reached for this user",
        threadReplies
      },
      { status: 409 }
    );
  }

  if (isDuplicateContent) {
    await logActionSafe({
      deploymentId,
      actionType: "reply",
      status: "blocked",
      targetTweetId: inReplyToTweetId,
      targetAuthorId,
      conversationId,
      contentHash,
      content: text,
      reason: `duplicate_content_${env.X_CONTENT_DEDUPE_WINDOW_HOURS}h`
    });
    return NextResponse.json(
      {
        error: "Duplicate reply blocked by dedupe guardrail"
      },
      { status: 409 }
    );
  }

  try {
    const { accessToken } = await getValidXAccessTokenForDeployment(deploymentId);
    const tweet = await createXTweet(accessToken, {
      text,
      replyToTweetId: inReplyToTweetId
    });

    await logActionSafe({
      deploymentId,
      actionType: "reply",
      status: "sent",
      targetTweetId: inReplyToTweetId,
      targetAuthorId,
      conversationId,
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
      actionType: "reply",
      status: "failed",
      targetTweetId: inReplyToTweetId,
      targetAuthorId,
      conversationId,
      contentHash,
      content: text,
      reason: error instanceof Error ? error.message : "reply_failed"
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to publish X reply" },
      { status: 502 }
    );
  }
}
