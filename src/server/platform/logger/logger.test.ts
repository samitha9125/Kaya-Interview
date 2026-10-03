import { describe, expect, it } from "vitest";
import { createLogger } from "./logger";

// secret-scan:ignore
const fakeNic = "199012345678";

function captureLogger() {
  const lines: string[] = [];
  const logger = createLogger({
    write: (line) => lines.push(line),
    now: () => new Date("2026-10-03T10:00:00.000Z"),
  });
  return { logger, lines };
}

describe("platform/logger: structured JSON", () => {
  it.each([{ level: "info" }, { level: "warn" }, { level: "error" }] as const)(
    "FR-PLAT-06: $level writes one JSON line with time, level, message and correlation ID",
    ({ level }) => {
      const { logger, lines } = captureLogger();

      logger[level]("credit check started", { correlationId: "K7Q2abcd", attempt: 1 });

      expect(lines).toHaveLength(1);
      expect(lines[0]?.endsWith("\n")).toBe(true);
      expect(JSON.parse(lines[0]!)).toEqual({
        time: "2026-10-03T10:00:00.000Z",
        level,
        msg: "credit check started",
        correlationId: "K7Q2abcd",
        attempt: 1,
      });
    },
  );

  it("FR-PLAT-06: NICs, passwords, tokens and scores never reach the output", () => {
    const { logger, lines } = captureLogger();

    logger.info(`message with ${fakeNic}`, {
      password: "hunter2",
      sessionToken: "tok_live_value",
      score: 742,
      body: { text: `my NIC is ${fakeNic}` },
    });

    expect(lines.join("")).not.toMatch(new RegExp(`${fakeNic}|hunter2|tok_live_value|742`));
  });

  it("FR-PLAT-06: fields can't overwrite the time, level or message", () => {
    const { logger, lines } = captureLogger();

    logger.warn("real message", { level: "info", msg: "forged", time: "never" });

    expect(JSON.parse(lines[0]!)).toMatchObject({ level: "warn", msg: "real message" });
  });
});
