import { createHmac, timingSafeEqual } from "node:crypto";

// Each purpose gets its own secret, derived from the encryption key, so
// none needs a setting of its own and none reveals the key.
type Purpose = "gov-api-key";

export function deriveSecret(key: Buffer, purpose: Purpose): string {
  return createHmac("sha256", key).update(purpose).digest("base64url");
}

// Constant-time, so a caller can't find the secret by timing guesses.
export function secretsMatch(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
