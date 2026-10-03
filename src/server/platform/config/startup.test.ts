import { describe, expect, it, vi } from "vitest";
import { exitOnInvalidConfig } from "./startup";

function fakeExit() {
  return vi.fn((code: number): never => {
    throw new Error(`exit ${code}`);
  });
}

describe("platform/config: server startup", () => {
  it("P0-16: invalid security config prints the operator message and exits with 1", () => {
    const printError = vi.fn();
    const exit = fakeExit();

    expect(() => exitOnInvalidConfig({ env: {}, printError, exit })).toThrow("exit 1");
    expect(printError).toHaveBeenCalledWith(expect.stringContaining("APP_ENCRYPTION_KEY"));
  });

  it("FR-PLAT-01: valid config starts normally", () => {
    const exit = fakeExit();
    const env = { APP_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString("base64") };

    exitOnInvalidConfig({ env, printError: vi.fn(), exit });

    expect(exit).not.toHaveBeenCalled();
  });
});
