import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-server";
import { redeploySchema } from "@/lib/schemas";
import { encrypt } from "@/lib/security";
import { getDeploymentById, getUserById, updateDeploymentById, updateDeploymentStatus } from "@/lib/store";
import { startDeploymentAfterPayment } from "@/lib/provisioning";

async function validateTelegram(token: string) {
  const url = `https://api.telegram.org/bot${encodeURIComponent(token)}/getMe`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return false;
  const payload = (await response.json().catch(() => ({}))) as { ok?: boolean };
  return Boolean(payload.ok);
}

async function validateDiscord(token: string) {
  const raw = token.trim();
  const withoutPrefix = raw.toLowerCase().startsWith("bot ") ? raw.slice(4).trim() : raw;
  const response = await fetch("https://discord.com/api/users/@me", {
    method: "GET",
    headers: { Authorization: `Bot ${withoutPrefix}` },
    cache: "no-store"
  });
  return response.ok;
}

export async function POST(request: Request) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = redeploySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const body = parsed.data;
  const deployment = await getDeploymentById(body.deploymentId);
  if (!deployment) {
    return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
  }

  const owner = await getUserById(deployment.userId);
  if (!owner || owner.email.toLowerCase().trim() !== authUser.email) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Paid plans: enforce active subscription for Starter and Pro (when subscription is present).
  if (deployment.subscriptionId && deployment.subscriptionStatus !== "active") {
    return NextResponse.json({ error: "Your subscription is not active. Please re-subscribe." }, { status: 402 });
  }

  const channel = body.channel;
  const channelPrimaryToken =
    channel === "telegram"
      ? body.telegram_bot_token?.trim() ?? ""
      : channel === "discord"
        ? body.discord_bot_token?.trim() ?? ""
        : body.slack_bot_token?.trim() ?? "";
  const channelSecondaryToken = channel === "slack" ? body.slack_app_token?.trim() ?? "" : "";

  // Validate tokens before we touch runtime.
  if (channel === "telegram") {
    const ok = await validateTelegram(channelPrimaryToken);
    if (!ok) return NextResponse.json({ error: "Telegram token is invalid." }, { status: 400 });
  } else if (channel === "discord") {
    const ok = await validateDiscord(channelPrimaryToken);
    if (!ok) return NextResponse.json({ error: "Discord token is invalid." }, { status: 400 });
  }

  await updateDeploymentById(deployment.id, {
    channel,
    encryptedChannelPrimaryToken: encrypt(channelPrimaryToken),
    encryptedChannelSecondaryToken: channel === "slack" ? encrypt(channelSecondaryToken) : null
  });

  await updateDeploymentStatus(deployment.id, "setup_started", "Redeploy requested. Provisioning a fresh runtime.");
  startDeploymentAfterPayment(deployment.id, `redeploy_${Date.now()}`);

  return NextResponse.json({ ok: true, deploymentId: deployment.id });
}
