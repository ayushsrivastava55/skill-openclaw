import { createHash } from "crypto";

export function normalizeXTextForDedupe(text: string) {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

export function hashXText(text: string) {
  return createHash("sha256").update(normalizeXTextForDedupe(text)).digest("hex");
}

export function sinceHoursIso(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

export function cooldownRemainingSeconds(lastActionAt: string, cooldownMinutes: number) {
  const lastMs = Date.parse(lastActionAt);
  if (!Number.isFinite(lastMs)) return 0;
  const nextAllowedMs = lastMs + cooldownMinutes * 60 * 1000;
  const remainingMs = nextAllowedMs - Date.now();
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
}
