import { createHash, randomBytes } from "node:crypto";

const TOKEN_BYTES = 32;

export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

// Only this hash is stored, so a leaked database yields no usable sessions.
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
