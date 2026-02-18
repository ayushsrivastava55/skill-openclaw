import { z } from "zod";
import { NextResponse } from "next/server";
import { isInternalRequestAuthorized } from "@/lib/internal-auth";
import { getValidXAccessTokenForDeployment } from "@/lib/x-service";
import { createXTweet } from "@/lib/x-api";

const schema = z.object({
  deploymentId: z.string().min(1),
  inReplyToTweetId: z.string().min(1),
  text: z.string().min(1).max(280)
});

export async function POST(request: Request) {
  if (!isInternalRequestAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const { accessToken } = await getValidXAccessTokenForDeployment(parsed.data.deploymentId);
    const tweet = await createXTweet(accessToken, {
      text: parsed.data.text,
      replyToTweetId: parsed.data.inReplyToTweetId
    });

    return NextResponse.json({
      ok: true,
      tweet
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to publish X reply" },
      { status: 502 }
    );
  }
}
