import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dbQuery } from "@/lib/neon-db";
import { decrypt } from "@/lib/security";

const requestSchema = z.object({
  telegram_bot_token: z.string().min(1, "telegram_bot_token is required")
});

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value ?? ""));
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

export async function POST(request: NextRequest) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const telegramToken = parsed.data.telegram_bot_token.trim();
  if (!telegramToken.includes(":")) {
    return NextResponse.json({ error: "Telegram bot token must include ':'" }, { status: 400 });
  }

  const result = await dbQuery(
    `SELECT
      id,
      plan,
      channel,
      status,
      model_provider,
      selected_model,
      encrypted_channel_primary_token,
      created_at,
      updated_at
     FROM deployments
     WHERE channel = 'telegram'
     ORDER BY updated_at DESC
     LIMIT 500`
  );

  for (const row of result.rows as Array<Record<string, unknown>>) {
    const encryptedToken = String(row.encrypted_channel_primary_token ?? "");
    if (!encryptedToken) continue;

    try {
      const storedToken = decrypt(encryptedToken).trim();
      if (storedToken !== telegramToken) continue;

      return NextResponse.json({
        ok: true,
        deployment: {
          id: String(row.id),
          plan: String(row.plan ?? "starter"),
          channel: String(row.channel ?? "telegram"),
          status: String(row.status ?? "setup_started"),
          modelProvider: String(row.model_provider ?? "openrouter"),
          selectedModel: String(row.selected_model ?? ""),
          createdAt: toIso(row.created_at),
          updatedAt: toIso(row.updated_at)
        }
      });
    } catch {
      // Ignore rows with undecryptable tokens.
    }
  }

  return NextResponse.json(
    { error: "No deployment found for this Telegram bot token." },
    { status: 404 }
  );
}
