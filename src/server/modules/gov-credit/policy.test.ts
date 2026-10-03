import { describe, expect, it } from "vitest";
import { decideSlot, isFresh, isUsableStale, retryDelayMs, type BudgetState } from "./policy";

const FETCHED = new Date("2026-07-01T00:00:00.000Z");
const DAY = 24 * 60 * 60_000;
const after = (ms: number) => new Date(FETCHED.getTime() + ms);

describe("gov-credit/policy: cache lifetime (BR-CRED-01)", () => {
  it.each([
    { ageMs: 30 * DAY - 1, fresh: true }, // just under 30 days → hit
    { ageMs: 30 * DAY, fresh: false }, // at 30 days → miss
    { ageMs: 0, fresh: true },
  ])("BR-CRED-01: a score $ageMs ms old → fresh $fresh", ({ ageMs, fresh }) => {
    expect(isFresh(FETCHED, after(ageMs), 30)).toBe(fresh);
  });

  it("BR-CRED-01: the lifetime follows CREDIT_CACHE_TTL_DAYS", () => {
    expect(isFresh(FETCHED, after(8 * DAY), 7)).toBe(false);
    expect(isFresh(FETCHED, after(8 * DAY), 9)).toBe(true);
  });
});

describe("gov-credit/policy: stale window (BR-CRED-02)", () => {
  it.each([
    { ageMs: 90 * DAY, usable: true }, // at 90 days → still usable as stale
    { ageMs: 90 * DAY + 1, usable: false }, // one ms later → not usable
    { ageMs: 31 * DAY, usable: true },
  ])("BR-CRED-02 / P0-08: a score $ageMs ms old → usable as stale $usable", ({ ageMs, usable }) => {
    expect(isUsableStale(FETCHED, after(ageMs))).toBe(usable);
  });
});

const NOW = new Date("2026-10-03T10:00:00.000Z");
const TODAY = "2026-10-03";
const open = (attempts: number, day = TODAY): BudgetState => ({
  day,
  attempts,
  blockedUntil: null,
  coolDownUntil: null,
});

describe("gov-credit/policy: daily budget (BR-CRED-03)", () => {
  it.each([
    { used: 4, ok: true }, // the 5th attempt is allowed
    { used: 5, ok: false }, // the 6th is never sent
  ])("BR-CRED-03 / P1-03: with $used attempts used today → slot $ok", ({ used, ok }) => {
    expect(decideSlot(open(used), NOW, TODAY, 5).ok).toBe(ok);
  });

  it("BR-CRED-03: a slot taken counts one more attempt for today", () => {
    expect(decideSlot(open(2), NOW, TODAY, 5)).toEqual({ ok: true, next: { ...open(3) } });
  });

  it("BR-CRED-03: a new Sri Lanka day starts a fresh count", () => {
    expect(decideSlot(open(5, "2026-10-02"), NOW, TODAY, 5)).toEqual({ ok: true, next: open(1) });
  });

  it("BR-CRED-03: an exhausted budget says so", () => {
    expect(decideSlot(open(5), NOW, TODAY, 5)).toEqual({ ok: false, reason: "budget_exhausted" });
  });
});

describe("gov-credit/policy: 429 block and cool-down (BR-CRED-04, BR-CRED-05)", () => {
  it.each([
    { untilMs: 1, ok: false }, // still blocked
    { untilMs: 0, ok: true }, // the block ends at blockedUntil
  ])("BR-CRED-04 / P1-02: blockedUntil $untilMs ms from now → slot $ok", ({ untilMs, ok }) => {
    const state = { ...open(0), blockedUntil: new Date(NOW.getTime() + untilMs) };

    expect(decideSlot(state, NOW, TODAY, 5)).toEqual(
      ok ? { ok: true, next: { ...state, attempts: 1 } } : { ok: false, reason: "blocked" },
    );
  });

  it.each([
    { untilMs: 1, ok: false },
    { untilMs: 0, ok: true },
  ])("BR-CRED-05: cool-down ending $untilMs ms from now → slot $ok", ({ untilMs, ok }) => {
    const state = { ...open(0), coolDownUntil: new Date(NOW.getTime() + untilMs) };

    expect(decideSlot(state, NOW, TODAY, 5).ok).toBe(ok);
  });

  it("BR-CRED-04: a block is reported before an exhausted budget", () => {
    const state = { ...open(5), blockedUntil: new Date(NOW.getTime() + 1) };

    expect(decideSlot(state, NOW, TODAY, 5)).toEqual({ ok: false, reason: "blocked" });
  });

  it("BR-CRED-05: a cool-down is reported as cooling down", () => {
    const state = { ...open(0), coolDownUntil: new Date(NOW.getTime() + 1) };

    expect(decideSlot(state, NOW, TODAY, 5)).toEqual({ ok: false, reason: "cooling_down" });
  });
});

describe("gov-credit/policy: retry delay with jitter (BR-CRED-05)", () => {
  it.each([
    { random: 0, delayMs: 750 }, // -25%
    { random: 0.5, delayMs: 1_000 },
    { random: 1, delayMs: 1_250 }, // +25%
  ])("BR-CRED-05: random $random → $delayMs ms", ({ random, delayMs }) => {
    expect(retryDelayMs(random)).toBe(delayMs);
  });
});
