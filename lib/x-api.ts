import { createHash, randomBytes } from "crypto";
import { env } from "@/lib/env";

const X_AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
const X_TOKEN_URL = "https://api.x.com/2/oauth2/token";
const X_API_BASE = "https://api.x.com/2";

export type XTokenResponse = {
  token_type: string;
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
};

function requireXClientId() {
  const clientId = env.X_CLIENT_ID?.trim();
  if (!clientId) {
    throw new Error("X_CLIENT_ID is not configured");
  }
  return clientId;
}

function toBase64Url(input: Buffer) {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function makeOAuthState() {
  return toBase64Url(randomBytes(32));
}

export function makePkceVerifier() {
  return toBase64Url(randomBytes(64));
}

export function makePkceChallenge(verifier: string) {
  return toBase64Url(createHash("sha256").update(verifier).digest());
}

export function getXRedirectUri(request?: Request) {
  if (env.X_REDIRECT_URI?.trim()) {
    return env.X_REDIRECT_URI.trim();
  }
  if (request) {
    const url = new URL(request.url);
    return `${url.origin}/api/x/callback`;
  }
  return `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/api/x/callback`;
}

export function getXScopes() {
  const raw = env.X_OAUTH_SCOPES;
  return raw
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function buildXAuthorizeUrl(input: {
  state: string;
  codeChallenge: string;
  redirectUri: string;
}) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: requireXClientId(),
    redirect_uri: input.redirectUri,
    scope: getXScopes().join(" "),
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256"
  });
  return `${X_AUTHORIZE_URL}?${params.toString()}`;
}

function makeClientAuthHeaders() {
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded"
  };

  const clientSecret = env.X_CLIENT_SECRET?.trim();
  if (clientSecret) {
    const auth = Buffer.from(`${requireXClientId()}:${clientSecret}`).toString("base64");
    headers.Authorization = `Basic ${auth}`;
  }

  return headers;
}

async function postToken(body: URLSearchParams): Promise<XTokenResponse> {
  const response = await fetch(X_TOKEN_URL, {
    method: "POST",
    headers: makeClientAuthHeaders(),
    body: body.toString()
  });

  const payload = (await response.json().catch(() => ({}))) as XTokenResponse & {
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !payload.access_token) {
    const message = payload.error_description ?? payload.error ?? "Failed to exchange X OAuth token";
    throw new Error(message);
  }

  return payload;
}

export async function exchangeCodeForTokens(input: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    code_verifier: input.codeVerifier
  });

  if (!env.X_CLIENT_SECRET?.trim()) {
    body.set("client_id", requireXClientId());
  }

  return postToken(body);
}

export async function refreshXAccessToken(refreshToken: string) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken
  });

  if (!env.X_CLIENT_SECRET?.trim()) {
    body.set("client_id", requireXClientId());
  }

  return postToken(body);
}

export async function getXMe(accessToken: string) {
  const response = await fetch(`${X_API_BASE}/users/me?user.fields=id,username,name`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: "no-store"
  });

  const payload = (await response.json().catch(() => ({}))) as {
    data?: { id: string; username: string; name?: string };
    errors?: Array<{ detail?: string; message?: string }>;
    title?: string;
    detail?: string;
  };

  if (!response.ok || !payload.data?.id) {
    const message =
      payload.errors?.[0]?.detail ??
      payload.errors?.[0]?.message ??
      payload.detail ??
      payload.title ??
      "Failed to fetch authenticated X user";
    throw new Error(message);
  }

  return payload.data;
}

export async function getXUserById(
  accessToken: string,
  userId: string
) {
  const fields = "id,username,name,description,location,url,verified,public_metrics,profile_image_url";
  const response = await fetch(`${X_API_BASE}/users/${encodeURIComponent(userId)}?user.fields=${encodeURIComponent(fields)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: "no-store"
  });

  const payload = (await response.json().catch(() => ({}))) as {
    data?: Record<string, unknown>;
    errors?: Array<{ detail?: string; message?: string }>;
    title?: string;
    detail?: string;
  };

  if (!response.ok || !payload.data) {
    const message =
      payload.errors?.[0]?.detail ??
      payload.errors?.[0]?.message ??
      payload.detail ??
      payload.title ??
      "Failed to fetch X user profile";
    throw new Error(message);
  }

  return payload.data;
}

function parseXError(payload: unknown, fallback: string) {
  const typed = payload as {
    errors?: Array<{ detail?: string; message?: string }>;
    detail?: string;
    title?: string;
    error?: string;
  };
  return (
    typed.errors?.[0]?.detail ??
    typed.errors?.[0]?.message ??
    typed.detail ??
    typed.title ??
    typed.error ??
    fallback
  );
}

export async function createXTweet(
  accessToken: string,
  input: {
    text: string;
    replyToTweetId?: string;
  }
) {
  const body: Record<string, unknown> = {
    text: input.text
  };

  if (input.replyToTweetId) {
    body.reply = { in_reply_to_tweet_id: input.replyToTweetId };
  }

  const response = await fetch(`${X_API_BASE}/tweets`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const payload = (await response.json().catch(() => ({}))) as {
    data?: { id: string; text: string };
  };

  if (!response.ok || !payload.data?.id) {
    throw new Error(parseXError(payload, "Failed to publish tweet"));
  }

  return payload.data;
}

export async function getXMentions(
  accessToken: string,
  userId: string,
  input?: {
    sinceId?: string;
    maxResults?: number;
  }
) {
  const params = new URLSearchParams({
    "tweet.fields": "author_id,conversation_id,created_at,public_metrics,referenced_tweets,text",
    expansions: "author_id",
    "user.fields": "id,name,username"
  });

  if (input?.sinceId) {
    params.set("since_id", input.sinceId);
  }

  const maxResults = Math.max(5, Math.min(100, input?.maxResults ?? 20));
  params.set("max_results", String(maxResults));

  const response = await fetch(`${X_API_BASE}/users/${encodeURIComponent(userId)}/mentions?${params}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: "no-store"
  });

  const payload = (await response.json().catch(() => ({}))) as {
    data?: Array<Record<string, unknown>>;
    includes?: Record<string, unknown>;
    meta?: Record<string, unknown>;
  };

  if (!response.ok) {
    throw new Error(parseXError(payload, "Failed to fetch X mentions"));
  }

  return payload;
}

export async function getXUserTweets(
  accessToken: string,
  userId: string,
  input?: {
    maxResults?: number;
  }
) {
  const params = new URLSearchParams({
    "tweet.fields": "created_at,public_metrics,text",
    exclude: "retweets,replies"
  });
  const maxResults = Math.max(5, Math.min(100, input?.maxResults ?? 20));
  params.set("max_results", String(maxResults));

  const response = await fetch(`${X_API_BASE}/users/${encodeURIComponent(userId)}/tweets?${params}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: "no-store"
  });

  const payload = (await response.json().catch(() => ({}))) as {
    data?: Array<Record<string, unknown>>;
    meta?: Record<string, unknown>;
  };

  if (!response.ok) {
    throw new Error(parseXError(payload, "Failed to fetch X user tweets"));
  }

  return payload;
}

export async function searchRecentXTweets(
  accessToken: string,
  input: {
    query: string;
    sinceId?: string;
    maxResults?: number;
    startTime?: string;
  }
) {
  const params = new URLSearchParams({
    query: input.query,
    "tweet.fields":
      "author_id,conversation_id,created_at,in_reply_to_user_id,lang,public_metrics,referenced_tweets,text",
    expansions: "author_id",
    "user.fields": "id,name,username,verified,public_metrics"
  });

  if (input.sinceId) {
    params.set("since_id", input.sinceId);
  }
  if (input.startTime) {
    params.set("start_time", input.startTime);
  }

  const maxResults = Math.max(10, Math.min(100, input.maxResults ?? 20));
  params.set("max_results", String(maxResults));

  const response = await fetch(`${X_API_BASE}/tweets/search/recent?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: "no-store"
  });

  const payload = (await response.json().catch(() => ({}))) as {
    data?: Array<Record<string, unknown>>;
    includes?: Record<string, unknown>;
    meta?: Record<string, unknown>;
  };

  if (!response.ok) {
    throw new Error(parseXError(payload, "Failed to search recent tweets"));
  }

  return payload;
}
