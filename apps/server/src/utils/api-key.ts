import { createHash, randomBytes } from "crypto";

/**
 * Generate a fresh API key. The raw value is shown to the user exactly once
 * (from the /apikeys endpoint); only the sha256 hash is stored in the DB.
 * The `prefix` (first 8 chars of the raw) is also stored so a user can
 * recognise which key in their list they are looking at without being able
 * to reconstruct the secret.
 */
export function generateApiKey(): {
  raw: string;
  hash: string;
  prefix: string;
} {
  const raw = "jtk_" + randomBytes(20).toString("hex"); // 40 hex chars after prefix
  const hash = hashApiKey(raw);
  const prefix = raw.slice(0, 8); // "jtk_xxx"
  return { raw, hash, prefix };
}

export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
