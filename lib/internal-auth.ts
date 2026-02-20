import { env } from "@/lib/env";

export function getInternalBotToken() {
  return env.INTERNAL_BOT_TOKEN?.trim() || env.RUNTIME_CALLBACK_TOKEN;
}

export function isInternalRequestAuthorized(request: Request) {
  const auth = request.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const headerToken = request.headers.get("x-runtime-token")?.trim() ?? "";
  const expected = getInternalBotToken();

  if (!expected) return false;
  return bearer === expected || headerToken === expected;
}
