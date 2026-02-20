import { z } from "zod";
import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { getDeploymentById, getUserById, saveXOAuthState, upsertUser } from "@/lib/store";
import { buildXAuthorizeUrl, getXRedirectUri, makeOAuthState, makePkceChallenge, makePkceVerifier } from "@/lib/x-api";
import { decrypt } from "@/lib/security";

const schema = z.object({
  deploymentId: z.string().min(1).optional(),
  telegram_bot_token: z.string().min(1).optional(),
  preconnect: z.boolean().optional(),
  x_user_key: z.string().min(1).optional()
});

function safeTokenMatch(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(actual, "utf8");
  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const deploymentId = parsed.data.deploymentId?.trim() ?? "";
  const isPreconnect = parsed.data.preconnect === true || !deploymentId;
  let userId = "";
  let scopedDeploymentId: string | undefined;

  if (!isPreconnect) {
    const telegramBotToken = (parsed.data.telegram_bot_token ?? "").trim();
    if (!telegramBotToken || !telegramBotToken.includes(":")) {
      return NextResponse.json({ error: "Telegram bot token must include ':'" }, { status: 400 });
    }

    const deployment = await getDeploymentById(deploymentId);
    if (!deployment) {
      return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
    }
    if (deployment.channel !== "telegram") {
      return NextResponse.json({ error: "Deployment channel must be telegram for X connect." }, { status: 400 });
    }

    let expectedTelegramToken = "";
    try {
      expectedTelegramToken = decrypt(deployment.encryptedChannelPrimaryToken);
    } catch {
      return NextResponse.json({ error: "Stored deployment token is invalid." }, { status: 500 });
    }
    if (!safeTokenMatch(expectedTelegramToken, telegramBotToken)) {
      return NextResponse.json({ error: "Telegram token does not match this deployment." }, { status: 403 });
    }

    userId = deployment.userId;
    scopedDeploymentId = deployment.id;
  } else {
    const providedUserId = parsed.data.x_user_key?.trim() ?? "";
    if (providedUserId) {
      const existing = await getUserById(providedUserId);
      if (existing) {
        userId = existing.id;
      }
    }

    if (!userId) {
      const created = await upsertUser({
        email: `x-preconnect-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@local.internal`,
        name: "X Connected Brand",
        photoURL: null
      });
      userId = created.id;
    }
  }

  try {
    const state = makeOAuthState();
    const codeVerifier = makePkceVerifier();
    const codeChallenge = makePkceChallenge(codeVerifier);
    const redirectUri = getXRedirectUri(request);

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await saveXOAuthState({
      state,
      deploymentId: scopedDeploymentId,
      userId,
      codeVerifier,
      redirectUri,
      expiresAt
    });

    const authorizeUrl = buildXAuthorizeUrl({
      state,
      codeChallenge,
      redirectUri
    });

    return NextResponse.json({
      ok: true,
      authorizeUrl,
      xUserKey: userId
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to initialize X OAuth"
      },
      { status: 500 }
    );
  }
}
