import { z } from "zod";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-server";
import { getDeploymentById, getUserByEmail, getUserById, saveXOAuthState, upsertUser } from "@/lib/store";
import { buildXAuthorizeUrl, getXRedirectUri, makeOAuthState, makePkceChallenge, makePkceVerifier } from "@/lib/x-api";

const schema = z.object({
  deploymentId: z.string().min(1).optional()
});

export async function POST(request: Request) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let owner = await getUserByEmail(authUser.email);
  if (!owner) {
    owner = await upsertUser({
      email: authUser.email,
      name: authUser.email.split("@")[0] || "User",
      photoURL: null
    });
  }

  const deploymentId = parsed.data.deploymentId?.trim();
  if (deploymentId) {
    const deployment = await getDeploymentById(deploymentId);
    if (!deployment) {
      return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
    }

    const deploymentOwner = await getUserById(deployment.userId);
    if (!deploymentOwner || deploymentOwner.email.toLowerCase().trim() !== authUser.email) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
      deploymentId: deploymentId ?? null,
      userId: owner.id,
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
      authorizeUrl
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
