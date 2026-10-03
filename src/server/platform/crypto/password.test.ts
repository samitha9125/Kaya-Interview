import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("platform/crypto: passwords (scrypt)", () => {
  it("FR-AUTH-01: the right password verifies", async () => {
    const stored = await hashPassword("correct horse");

    await expect(verifyPassword("correct horse", stored)).resolves.toBe(true);
  });

  it.each([{ attempt: "correct hors" }, { attempt: "Correct horse" }, { attempt: "" }])(
    "FR-AUTH-01: a wrong password '$attempt' does not verify",
    async ({ attempt }) => {
      const stored = await hashPassword("correct horse");

      await expect(verifyPassword(attempt, stored)).resolves.toBe(false);
    },
  );

  it("FR-AUTH-01: the stored hash is salted and never contains the password", async () => {
    const first = await hashPassword("correct horse");
    const second = await hashPassword("correct horse");

    expect(first).not.toBe(second);
    expect(first).not.toContain("correct horse");
    expect(first).toMatch(/^scrypt\$/);
  });

  it.each([{ stored: "" }, { stored: "bcrypt$x" }, { stored: "scrypt$1$2$3$salt" }])(
    "FR-AUTH-01: a malformed stored hash '$stored' never verifies",
    async ({ stored }) => {
      await expect(verifyPassword("anything", stored)).resolves.toBe(false);
    },
  );
});
