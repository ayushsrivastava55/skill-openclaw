import { NextResponse } from "next/server";
import { consumeXOAuthState, getDeploymentById, saveXConnection } from "@/lib/store";
import { encrypt } from "@/lib/security";
import { exchangeCodeForTokens, getXMe } from "@/lib/x-api";
import { computeExpiresAt } from "@/lib/x-service";
import { env } from "@/lib/env";

function redirectWithStatus(status: "success" | "error", message: string, deploymentId?: string, username?: string) {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const url = new URL("/", base);
  url.searchParams.set("x_connect", status);
  url.searchParams.set("message", message);
  if (deploymentId) {
    url.searchParams.set("deploymentId", deploymentId);
  }
  if (username) {
    url.searchParams.set("x_username", username);
  }
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code")?.trim();
  const state = searchParams.get("state")?.trim();
  const error = searchParams.get("error")?.trim();
  const errorDescription = searchParams.get("error_description")?.trim();

  if (error) {
    return redirectWithStatus("error", errorDescription || error);
  }

  if (!code || !state) {
    return redirectWithStatus("error", "Missing OAuth code or state");
  }

  const pending = await consumeXOAuthState(state);
  if (!pending) {
    return redirectWithStatus("error", "OAuth state expired or invalid");
  }

  const expiresMs = Date.parse(pending.expiresAt);
  if (!Number.isFinite(expiresMs) || Date.now() > expiresMs) {
    return redirectWithStatus("error", "OAuth state expired", pending.deploymentId);
  }

  const deployment = await getDeploymentById(pending.deploymentId);
  if (!deployment || deployment.userId !== pending.userId) {
    return redirectWithStatus("error", "Deployment no longer available", pending.deploymentId);
  }

  try {
    const tokens = await exchangeCodeForTokens({
      code,
      codeVerifier: pending.codeVerifier,
      redirectUri: pending.redirectUri
    });

    const me = await getXMe(tokens.access_token);

    await saveXConnection({
      deploymentId: pending.deploymentId,
      userId: pending.userId,
      xUserId: me.id,
      username: me.username,
      name: me.name ?? null,
      encryptedAccessToken: encrypt(tokens.access_token),
      encryptedRefreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
      tokenType: tokens.token_type || "bearer",
      scope: (tokens.scope ?? "").split(/\s+/).map((item) => item.trim()).filter(Boolean),
      expiresAt: computeExpiresAt(tokens.expires_in)
    });

    return redirectWithStatus("success", "X account connected", pending.deploymentId, me.username);
  } catch (err) {
    return redirectWithStatus(
      "error",
      err instanceof Error ? err.message : "Failed to complete X OAuth",
      pending.deploymentId
    );
  }
}
