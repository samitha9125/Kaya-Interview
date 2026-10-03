import { describe, expect, it } from "vitest";
import { LOCKOUT_POLICY } from "./config";
import { isLocked, registerFailure, type LockoutState } from "./lockout";

const NOW = new Date("2026-10-03T10:00:00.000Z");
const minutes = (count: number) => count * 60_000;
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs);
const unlocked = (failedAttempts: number): LockoutState => ({ failedAttempts, lockedUntil: null });

describe("auth/lockout: consecutive failures", () => {
  it.each([
    { before: 3, after: 4, locked: false }, // 4th failure: still open
    { before: 4, after: 5, locked: true }, // 5th failure: locks
  ])("BR-AUTH-02 / P0-13: failure $after → locked $locked", ({ before, after, locked }) => {
    const state = registerFailure(unlocked(before), NOW, LOCKOUT_POLICY);

    expect(state.failedAttempts).toBe(after);
    expect(isLocked(state, NOW)).toBe(locked);
  });

  it("BR-AUTH-02 / P0-13: the 5th failure locks for exactly 15 minutes", () => {
    const state = registerFailure(unlocked(4), NOW, LOCKOUT_POLICY);

    expect(state.lockedUntil).toEqual(at(minutes(15)));
  });
});

describe("auth/lockout: how long a lock lasts", () => {
  const locked: LockoutState = { failedAttempts: 5, lockedUntil: at(minutes(15)) };

  it.each([
    { offsetMs: minutes(15) - 1, expected: true }, // 1 ms before the end → locked
    { offsetMs: minutes(15), expected: false }, // at the end → open
  ])("BR-AUTH-02: $offsetMs ms after locking → locked $expected", ({ offsetMs, expected }) => {
    expect(isLocked(locked, at(offsetMs))).toBe(expected);
  });
});
