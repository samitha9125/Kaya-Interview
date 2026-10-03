import { describe, expect, it } from "vitest";
import { parseConfig } from "./env";

// A well-formed 32-byte key, base64-encoded. Not a real secret.
const VALID_KEY = Buffer.alloc(32, 7).toString("base64");

const validEnv = { APP_ENCRYPTION_KEY: VALID_KEY };

describe("platform/config: startup validation", () => {
  it("FR-PLAT-01: a valid environment parses, with defaults for the optional settings", () => {
    const result = parseConfig(validEnv);

    expect(result).toEqual({
      ok: true,
      config: {
        APP_ENCRYPTION_KEY: Buffer.alloc(32, 7),
        AUTO_DECISION_THRESHOLD: 9_500,
        CREDIT_CACHE_TTL_DAYS: 30,
        DEMO_MODE: false,
        OPENROUTER_API_KEY: undefined,
        DATABASE_PATH: "bank.db",
        GOV_API_BASE_URL: "http://localhost:3000/api/mock-gov",
        CHAT_MODEL_PROVIDER: "openrouter",
      },
    });
  });

  it.each([
    { case: "missing", value: undefined },
    { case: "empty", value: "" },
    { case: "16 bytes", value: Buffer.alloc(16, 7).toString("base64") },
    { case: "33 bytes", value: Buffer.alloc(33, 7).toString("base64") },
    { case: "not base64", value: "!".repeat(43) + "=" },
  ])("P0-16: APP_ENCRYPTION_KEY $case → the app refuses to start", ({ value }) => {
    const result = parseConfig({ APP_ENCRYPTION_KEY: value });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toContain("APP_ENCRYPTION_KEY");
  });

  it.each([
    { value: "-1" },
    { value: "10001" },
    { value: "0.95" },
    { value: "95%" },
    { value: "high" },
  ])("P0-16: AUTO_DECISION_THRESHOLD $value → the app refuses to start", ({ value }) => {
    const result = parseConfig({ ...validEnv, AUTO_DECISION_THRESHOLD: value });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toContain("AUTO_DECISION_THRESHOLD");
  });

  it.each([
    { value: "0", expected: 0 },
    { value: "9500", expected: 9_500 },
    { value: "10000", expected: 10_000 },
    { value: "", expected: 9_500 },
  ])("FR-PLAT-01: AUTO_DECISION_THRESHOLD '$value' → $expected bp", ({ value, expected }) => {
    const result = parseConfig({ ...validEnv, AUTO_DECISION_THRESHOLD: value });

    expect(result.ok && result.config.AUTO_DECISION_THRESHOLD).toBe(expected);
  });

  it.each([{ value: "yes" }, { value: "1" }, { value: "TRUE" }])(
    "P0-16: DEMO_MODE '$value' → the app refuses to start rather than guess",
    ({ value }) => {
      const result = parseConfig({ ...validEnv, DEMO_MODE: value });

      expect(result.ok).toBe(false);
      expect(!result.ok && result.message).toContain("DEMO_MODE");
    },
  );

  it.each([
    { value: undefined, expected: false },
    { value: "false", expected: false },
    { value: "true", expected: true },
  ])(
    "BR-SET-01: DEMO_MODE '$value' → $expected (off unless explicitly on)",
    ({ value, expected }) => {
      const result = parseConfig({ ...validEnv, DEMO_MODE: value });

      expect(result.ok && result.config.DEMO_MODE).toBe(expected);
    },
  );

  it.each([{ value: "0" }, { value: "-30" }, { value: "7.5" }])(
    "FR-PLAT-01: CREDIT_CACHE_TTL_DAYS $value → the app refuses to start",
    ({ value }) => {
      const result = parseConfig({ ...validEnv, CREDIT_CACHE_TTL_DAYS: value });

      expect(result.ok).toBe(false);
      expect(!result.ok && result.message).toContain("CREDIT_CACHE_TTL_DAYS");
    },
  );

  it("FR-PLAT-01: an empty OPENROUTER_API_KEY counts as missing, so Settings can say so", () => {
    const result = parseConfig({ ...validEnv, OPENROUTER_API_KEY: "" });

    expect(result.ok && result.config.OPENROUTER_API_KEY).toBeUndefined();
  });

  it("FR-PLAT-01: the operator message lists every problem and never echoes a value", () => {
    const badKey = "not-a-key-but-should-never-be-printed";

    const result = parseConfig({ APP_ENCRYPTION_KEY: badKey, AUTO_DECISION_THRESHOLD: "20000" });

    expect(result.ok).toBe(false);
    const message = result.ok ? "" : result.message;
    expect(message).toContain("APP_ENCRYPTION_KEY");
    expect(message).toContain("AUTO_DECISION_THRESHOLD");
    expect(message).not.toContain(badKey);
    expect(message).not.toContain("20000");
  });

  it.each([
    { url: "https://credit.gov.example/api", ok: true },
    { url: "http://localhost:3100/api/mock-gov", ok: true },
    { url: "http://credit.gov.example/api", ok: false }, // plain HTTP off this machine
    { url: "ftp://localhost/api", ok: false },
    { url: "not a url", ok: false },
  ])("ARCHITECTURE §10: GOV_API_BASE_URL $url → starts $ok", ({ url, ok }) => {
    expect(parseConfig({ ...validEnv, GOV_API_BASE_URL: url }).ok).toBe(ok);
  });

  it.each([{ demoMode: undefined }, { demoMode: "false" }])(
    "FR-PLAT-01: the scripted model with DEMO_MODE $demoMode → the app refuses to start",
    ({ demoMode }) => {
      const result = parseConfig({
        ...validEnv,
        CHAT_MODEL_PROVIDER: "scripted",
        DEMO_MODE: demoMode,
      });

      expect(result.ok).toBe(false);
      expect(!result.ok && result.message).toContain("CHAT_MODEL_PROVIDER");
    },
  );

  it("FR-PLAT-01: the scripted model runs only in demo mode", () => {
    const result = parseConfig({ ...validEnv, CHAT_MODEL_PROVIDER: "scripted", DEMO_MODE: "true" });

    expect(result.ok && result.config.CHAT_MODEL_PROVIDER).toBe("scripted");
  });
});
