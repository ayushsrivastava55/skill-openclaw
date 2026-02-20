import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { env } from "@/lib/env";

function getKey() {
  return createHash("sha256").update(env.ENCRYPTION_KEY).digest();
}

export function encrypt(value: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(":");
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error("Invalid encrypted payload");
  }
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const output = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final()
  ]);
  return output.toString("utf8");
}

export function makeId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

export function nowIso() {
  return new Date().toISOString();
}
