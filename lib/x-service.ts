import { encrypt, decrypt } from "@/lib/security";
import { refreshXAccessToken } from "@/lib/x-api";
import {
  getDeploymentById,
  getXConnectionByDeploymentId,
  getXUserConnectionByUserId,
  updateXConnectionTokens,
  updateXUserConnectionTokens
} from "@/lib/store";
import type { XConnectionRecord, XUserConnectionRecord } from "@/lib/types";

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
  const deployment = await getDeploymentById(deploymentId);
  if (!deployment) {
    throw new Error("Deployment not found");
  }

  const deploymentConnection = await getXConnectionByDeploymentId(deploymentId);
  const userConnection = deploymentConnection
    ? null
    : await getXUserConnectionByUserId(deployment.userId);
  const connection = deploymentConnection ?? userConnection;
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

  const tokenUpdate = {
    encryptedAccessToken: encrypt(nextAccessToken),
    encryptedRefreshToken: encrypt(nextRefreshToken),
    tokenType: refreshed.token_type || connection.tokenType,
    scope: nextScopes,
    expiresAt: computeExpiresAt(refreshed.expires_in)
  };

  let updated: XConnectionRecord | XUserConnectionRecord;
  if (deploymentConnection) {
    updated = await updateXConnectionTokens(deploymentId, tokenUpdate);
  } else {
    updated = await updateXUserConnectionTokens(deployment.userId, tokenUpdate);
  }

  return {
    connection: updated,
    accessToken: nextAccessToken
  };
}

export async function getValidXAccessTokenForUser(userId: string) {
  const connection = await getXUserConnectionByUserId(userId);
  if (!connection) {
    throw new Error("X account is not connected");
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

  const updated = await updateXUserConnectionTokens(userId, {
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
