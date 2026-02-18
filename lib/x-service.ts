import { encrypt, decrypt } from "@/lib/security";
import { refreshXAccessToken } from "@/lib/x-api";
import { getXConnectionByDeploymentId, updateXConnectionTokens } from "@/lib/store";

const REFRESH_SKEW_MS = 120_000;

function shouldRefresh(expiresAt: string | null) {
  if (!expiresAt) return false;
  const expiresMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresMs)) return false;
  return Date.now() + REFRESH_SKEW_MS >= expiresMs;
}

function computeExpiresAt(expiresIn?: number) {
  if (!expiresIn || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    return null;
  }
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

export async function getValidXAccessTokenForDeployment(deploymentId: string) {
  const connection = await getXConnectionByDeploymentId(deploymentId);
  if (!connection) {
    throw new Error("X account is not connected for this deployment");
  }

  if (!shouldRefresh(connection.expiresAt)) {
    return {
      connection,
      accessToken: decrypt(connection.encryptedAccessToken)
    };
  }

  if (!connection.encryptedRefreshToken) {
    throw new Error("X token expired and no refresh token is available. Reconnect X account.");
  }

  const refreshToken = decrypt(connection.encryptedRefreshToken);
  const refreshed = await refreshXAccessToken(refreshToken);

  const nextAccessToken = refreshed.access_token;
  const nextRefreshToken = refreshed.refresh_token?.trim() || refreshToken;
  const nextScopes = refreshed.scope
    ? refreshed.scope.split(/\s+/).map((item) => item.trim()).filter(Boolean)
    : connection.scope;

  const updated = await updateXConnectionTokens(deploymentId, {
    encryptedAccessToken: encrypt(nextAccessToken),
    encryptedRefreshToken: encrypt(nextRefreshToken),
    tokenType: refreshed.token_type || connection.tokenType,
    scope: nextScopes,
    expiresAt: computeExpiresAt(refreshed.expires_in)
  });

  return {
    connection: updated,
    accessToken: nextAccessToken
  };
}

export { computeExpiresAt };
