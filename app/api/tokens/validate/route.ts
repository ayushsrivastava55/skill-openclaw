import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-server";
import { z } from "zod";

const schema = z.object({
  channel: z.enum(["telegram", "discord"]),
  token: z.string().min(1).max(512)
});

function normalizeToken(token: string) {
  return token.trim();
}

async function validateTelegram(token: string) {
  const url = `https://api.telegram.org/bot${encodeURIComponent(token)}/getMe`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    return { ok: false, error: `Telegram token check failed (${response.status})` };
  }
  const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; result?: { username?: string } };
  if (!payload.ok) {
    return { ok: false, error: "Telegram token is invalid." };
  }
  return { ok: true, username: payload.result?.username ?? null };
}

async function validateDiscord(token: string) {
  const raw = token.trim();
  const withoutPrefix = raw.toLowerCase().startsWith("bot ") ? raw.slice(4).trim() : raw;
  const response = await fetch("https://discord.com/api/users/@me", {
    method: "GET",
    headers: {
      Authorization: `Bot ${withoutPrefix}`
    },
    cache: "no-store"
  });
  if (!response.ok) {
    return { ok: false, error: "Discord token is invalid." };
  }
  const payload = (await response.json().catch(() => ({}))) as { id?: string; username?: string };
  if (!payload.id) {
    return { ok: false, error: "Discord token is invalid." };
  }
  return { ok: true, username: payload.username ?? null };
}

export async function POST(request: Request) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const channel = parsed.data.channel;
  const token = normalizeToken(parsed.data.token);

  try {
    if (channel === "telegram") {
      const result = await validateTelegram(token);
      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true, channel, username: result.username });
    }
    const result = await validateDiscord(token);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, channel, username: result.username });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Token validation failed";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}

