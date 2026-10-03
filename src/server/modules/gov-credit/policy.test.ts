import { describe, expect, it } from "vitest";
import { decideSlot, isFresh, isUsableStale, type BudgetState } from "./policy";

const FETCHED = new Date("2026-07-01T00:00:00.000Z");
const DAY = 24 * 60 * 60_000;
const after = (ms: number) => new Date(FETCHED.getTime() + ms);

describe("gov-credit/policy: cache lifetime (BR-CRED-01)", () => {
  it.each([
    { ageMs: 30 * DAY - 1, fresh: true }, // just under 30 days → hit
    { ageMs: 30 * DAY, fresh: false }, // at 30 days → miss
  ])("BR-CRED-01: a score $ageMs ms old → fresh $fresh", ({ ageMs, fresh }) => {
    expect(isFresh(FETCHED, after(ageMs), 30)).toBe(fresh);
  });
});

describe("gov-credit/policy: stale window (BR-CRED-02)", () => {
  it.each([
    { ageMs: 90 * DAY, usable: true }, // at 90 days → still usable as stale
    { ageMs: 90 * DAY + 1, usable: false }, // one ms later → not usable
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
});
