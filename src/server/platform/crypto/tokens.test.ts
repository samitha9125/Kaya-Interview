import { describe, expect, it } from "vitest";
import { generateToken, hashToken } from "./tokens";

describe("platform/crypto: session tokens", () => {
  it("FR-AUTH-02: a token carries 256 bits of randomness, URL-safe", () => {
    const token = generateToken();

    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("FR-AUTH-02: two tokens differ", () => {
    expect(generateToken()).not.toBe(generateToken());
  });

  it("FR-AUTH-02: only the SHA-256 hash is stored, and it is stable", () => {
    expect(hashToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(hashToken("abc")).toBe(hashToken("abc"));
  });
});
