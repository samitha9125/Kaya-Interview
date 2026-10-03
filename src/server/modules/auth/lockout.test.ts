import { describe, expect, it } from "vitest";
import { LOCKOUT_POLICY } from "./config";
import { isLocked, registerFailure, registerSuccess, type LockoutState } from "./lockout";

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

  it("BR-AUTH-02 / P0-13: a 6th failure during the lockout keeps it locked and doesn't extend it", () => {
    const locked = registerFailure(unlocked(4), NOW, LOCKOUT_POLICY);

    const state = registerFailure(locked, at(minutes(5)), LOCKOUT_POLICY);

    expect(state.lockedUntil).toEqual(at(minutes(15)));
    expect(isLocked(state, at(minutes(5)))).toBe(true);
  });
});

describe("auth/lockout: how long a lock lasts", () => {
  const locked: LockoutState = { failedAttempts: 5, lockedUntil: at(minutes(15)) };

  it.each([
    { offsetMs: minutes(15) - 1, expected: true }, // 1 ms before the end → locked
    { offsetMs: minutes(15), expected: false }, // at the end → open
    { offsetMs: minutes(15) + 1, expected: false }, // just after → open
  ])("BR-AUTH-02: $offsetMs ms after locking → locked $expected", ({ offsetMs, expected }) => {
    expect(isLocked(locked, at(offsetMs))).toBe(expected);
  });

  it("BR-AUTH-02: an account that was never locked is open", () => {
    expect(isLocked(unlocked(0), NOW)).toBe(false);
  });

  it("BR-AUTH-02: after a lock expires, the next failure starts a fresh count", () => {
    const state = registerFailure(locked, at(minutes(15)), LOCKOUT_POLICY);

    expect(state).toEqual({ failedAttempts: 1, lockedUntil: null });
  });

  it("BR-AUTH-02: a failure before a lock expires still counts on top of the earlier ones", () => {
    const state = registerFailure(locked, at(minutes(15) - 1), LOCKOUT_POLICY);

    expect(state.failedAttempts).toBe(6);
  });
});

describe("auth/lockout: success", () => {
  it("BR-AUTH-02: a correct password clears the failure count, so failures must be consecutive", () => {
    const state = registerSuccess();

    expect(state).toEqual({ failedAttempts: 0, lockedUntil: null });
    expect(registerFailure(state, NOW, LOCKOUT_POLICY).failedAttempts).toBe(1);
  });
});
