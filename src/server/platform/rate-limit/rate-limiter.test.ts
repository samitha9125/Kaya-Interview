import { describe, expect, it } from "vitest";
import { movableClock } from "@/test/fakes";
import { createRateLimiter } from "./rate-limiter";

function takeTimes(take: () => boolean, times: number): boolean[] {
  return Array.from({ length: times }, take);
}

describe("platform/rate-limit: a sliding window per key", () => {
  it.each([
    { attempt: 10, allowed: true }, // the limit itself is allowed
    { attempt: 11, allowed: false }, // one over is refused
  ])(
    "FR-AUTH-07: attempt $attempt of a 10-per-window limit → allowed $allowed",
    ({ attempt, allowed }) => {
      const { clock } = movableClock();
      const limiter = createRateLimiter({ limit: 10, windowMs: 60_000, clock });

      const results = takeTimes(() => limiter.take("ip-1"), attempt);

      expect(results.at(-1)).toBe(allowed);
    },
  );

  it("FR-AUTH-07: each key has its own allowance", () => {
    const { clock } = movableClock();
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, clock });
    limiter.take("ip-1");

    expect(limiter.take("ip-2")).toBe(true);
    expect(limiter.take("ip-1")).toBe(false);
  });

  it.each([
    { elapsedMs: 59_999, allowed: false }, // still inside the window
    { elapsedMs: 60_000, allowed: true }, // the first attempt has left the window
  ])(
    "FR-AUTH-07: $elapsedMs ms after the first attempt → allowed $allowed",
    ({ elapsedMs, allowed }) => {
      const { clock, advance } = movableClock();
      const limiter = createRateLimiter({ limit: 2, windowMs: 60_000, clock });
      limiter.take("ip-1");
      advance(1_000);
      limiter.take("ip-1");
      advance(elapsedMs - 1_000);

      expect(limiter.take("ip-1")).toBe(allowed);
    },
  );

  it("FR-AUTH-07: refused attempts don't count, so a blocked caller isn't kept out forever", () => {
    const { clock, advance } = movableClock();
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, clock });
    limiter.take("ip-1");
    advance(30_000);
    limiter.take("ip-1");
    advance(30_000);

    expect(limiter.take("ip-1")).toBe(true);
  });
});
