import { beforeEach, describe, expect, it, vi } from "vitest";

// getConfig caches per process, so each test gets a fresh module.
beforeEach(() => {
  vi.resetModules();
});

describe("platform/config: getConfig", () => {
  it("P0-16: invalid security config throws a ConfigError carrying the operator message", async () => {
    const { ConfigError, getConfig } = await import("./load");

    expect(() => getConfig({})).toThrow(ConfigError);
    expect(() => getConfig({})).toThrow(/APP_ENCRYPTION_KEY: missing/);
  });

  it("FR-PLAT-01: a valid config is parsed once and then reused", async () => {
    const { getConfig } = await import("./load");
    const key = Buffer.alloc(32, 1).toString("base64");

    const first = getConfig({ APP_ENCRYPTION_KEY: key });
    const second = getConfig({});

    expect(second).toBe(first);
  });
});
