import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

// OWASP Password Storage Cheat Sheet minimum for scrypt: N=2^17, r=8, p=1.
const COST = 2 ** 17;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
const KEY_BYTES = 64;
const SALT_BYTES = 16;

function deriveKey(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  // scrypt needs about 128 × N × r bytes; Node's default cap is 32 MiB.
  const maxmem = 256 * (options.N ?? COST) * (options.r ?? BLOCK_SIZE);
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_BYTES, { ...options, maxmem }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

// Stored as "scrypt$N$r$p$salt$hash", so the cost can be raised later
// while old hashes still verify.
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const options = { N: COST, r: BLOCK_SIZE, p: PARALLELISM };
  const key = await deriveKey(password, salt, options);
  return ["scrypt", COST, BLOCK_SIZE, PARALLELISM, salt.toString("base64"), key.toString("base64")]
    .map(String)
    .join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash, ...rest] = stored.split("$");
  if (scheme !== "scrypt" || !n || !r || !p || !salt || !hash || rest.length > 0) return false;
  const expected = Buffer.from(hash, "base64");
  const options = { N: Number(n), r: Number(r), p: Number(p) };
  const actual = await deriveKey(password, Buffer.from(salt, "base64"), options).catch(() => null);
  if (!actual || actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
