import { describe, expect, it } from "vitest";
import { ConfigError, getConfig } from "./load";

describe("platform/config: getConfig", () => {
  it("P0-16: invalid security config throws a ConfigError carrying the operator message", () => {
    expect(() => getConfig({ AUTO_DECISION_THRESHOLD: "9500" })).toThrow(ConfigError);
    expect(() => getConfig({})).toThrow(/APP_ENCRYPTION_KEY: missing/);
  });

  it("FR-PLAT-01: a valid config is parsed once and then reused", () => {
    const key = Buffer.alloc(32, 1).toString("base64");

    const first = getConfig({ APP_ENCRYPTION_KEY: key });
    const second = getConfig({});

    expect(second).toBe(first);
  });
});
