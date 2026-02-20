import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserById } from "@/lib/store";
import { getValidXAccessTokenForUser } from "@/lib/x-service";
import { getXUserById } from "@/lib/x-api";

const schema = z.object({
  x_user_key: z.string().min(1, "x_user_key is required")
});

function toOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const userId = parsed.data.x_user_key.trim();
  const user = await getUserById(userId);
  if (!user) {
    return NextResponse.json({ error: "X user session not found" }, { status: 404 });
  }

  try {
    const { connection, accessToken } = await getValidXAccessTokenForUser(user.id);
    const profile = await getXUserById(accessToken, connection.xUserId);

    const username = toOptionalString(profile.username);
    const name = toOptionalString(profile.name);
    const description = toOptionalString(profile.description);
    return NextResponse.json({
      ok: true,
      connected: true,
      x: {
        userId: connection.xUserId,
        username: username ?? connection.username,
        name: name ?? connection.name ?? null,
        description: description ?? null,
        url: toOptionalString(profile.url) ?? null,
        verified: Boolean(profile.verified ?? false),
        profileImageUrl: toOptionalString(profile.profile_image_url) ?? null,
        publicMetrics:
          typeof profile.public_metrics === "object" && profile.public_metrics
            ? profile.public_metrics
            : null
      },
      brandHints: {
        // Important: connected X identity is operational context, not brand identity source-of-truth.
        // We intentionally do not suggest brand name/description from X profile to avoid accidental overwrite.
        name: "",
        description: "",
        website: "",
        socialLinks: {
          twitter: username ? `https://x.com/${username}` : `https://x.com/${connection.username}`
        }
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        connected: false,
        error: error instanceof Error ? error.message : "Failed to load X profile"
      },
      { status: 400 }
    );
  }
}
