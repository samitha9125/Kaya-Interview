import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
const IV_BYTES = 12;

// Stored as "v1.<iv>.<tag>.<ciphertext>" (base64url), so the format can
// change later without guessing what an old value is.
export function encryptField(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, ciphertext].map(encodePart).join(".");
}

// Throws on tampering or the wrong key: our own stored data failing to
// authenticate is never an expected outcome.
export function decryptField(stored: string, key: Buffer): string {
  const [version, iv, tag, ciphertext, ...rest] = stored.split(".");
  if (version !== VERSION || !iv || !tag || ciphertext === undefined || rest.length > 0) {
    throw new Error("Encrypted field is malformed");
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

function encodePart(part: string | Buffer): string {
  return typeof part === "string" ? part : part.toString("base64url");
}
