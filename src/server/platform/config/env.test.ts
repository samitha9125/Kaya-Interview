import { describe, expect, it } from "vitest";
import { parseConfig } from "./env";

// A well-formed 32-byte key, base64-encoded. Not a real secret.
const VALID_KEY = Buffer.alloc(32, 7).toString("base64");

const validEnv = { APP_ENCRYPTION_KEY: VALID_KEY };

describe("platform/config: startup validation", () => {
  it.each([
    { case: "missing", value: undefined },
    { case: "16 bytes", value: Buffer.alloc(16, 7).toString("base64") },
  ])("P0-16: APP_ENCRYPTION_KEY $case → the app refuses to start", ({ value }) => {
    const result = parseConfig({ APP_ENCRYPTION_KEY: value });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toContain("APP_ENCRYPTION_KEY");
  });

  it.each([{ value: "-1" }, { value: "10001" }])(
    "P0-16: AUTO_DECISION_THRESHOLD $value → the app refuses to start",
    ({ value }) => {
      const result = parseConfig({ ...validEnv, AUTO_DECISION_THRESHOLD: value });

      expect(result.ok).toBe(false);
      expect(!result.ok && result.message).toContain("AUTO_DECISION_THRESHOLD");
    },
  );
});
