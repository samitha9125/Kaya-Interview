import { describe, expect, it } from "vitest";
import { decryptField, encryptField } from "./field-encryption";

const key = Buffer.alloc(32, 3);
const otherKey = Buffer.alloc(32, 4);
// A generated-looking NIC; not a real person's. secret-scan:ignore
const fakeNic = "199012345678";

// The first character is always fully significant; the last one of a
// base64 segment can be padding bits that decode to the same bytes.
function flipFirstChar(segment: string): string {
  return (segment.startsWith("A") ? "B" : "A") + segment.slice(1);
}

describe("platform/crypto: field encryption (AES-256-GCM)", () => {
  it("FR-PLAT-02: a field round-trips", () => {
    expect(decryptField(encryptField(fakeNic, key), key)).toBe(fakeNic);
  });

  it("FR-PLAT-02: the stored value never contains the plaintext", () => {
    expect(encryptField(fakeNic, key)).not.toContain(fakeNic);
  });

  it("FR-PLAT-02: the same plaintext encrypts differently each time (fresh IV)", () => {
    expect(encryptField(fakeNic, key)).not.toBe(encryptField(fakeNic, key));
  });

  it.each([
    { part: "IV", index: 1 },
    { part: "auth tag", index: 2 },
    { part: "ciphertext", index: 3 },
  ])("FR-PLAT-02: a tampered $part fails to decrypt", ({ index }) => {
    const parts = encryptField(fakeNic, key).split(".");
    parts[index] = flipFirstChar(parts[index]!);

    expect(() => decryptField(parts.join("."), key)).toThrow();
  });

  it("FR-PLAT-02: the wrong key fails to decrypt", () => {
    expect(() => decryptField(encryptField(fakeNic, key), otherKey)).toThrow();
  });

  it.each([{ stored: "" }, { stored: "v1.a.b" }, { stored: "v0.a.b.c" }])(
    "FR-PLAT-02: a malformed stored value '$stored' fails to decrypt",
    ({ stored }) => {
      expect(() => decryptField(stored, key)).toThrow(/malformed/);
    },
  );
});
