import { describe, expect, it } from "vitest";
import { SESSION_POLICY, STEP_UP_VALID_MS } from "./config";
import { isSessionActive, isStepUpFresh } from "./session-policy";

const CREATED = new Date("2026-10-03T10:00:00.000Z");
const MINUTE = 60_000;
const at = (offsetMs: number) => new Date(CREATED.getTime() + offsetMs);

describe("auth/session-policy: idle timeout", () => {
  it.each([
    { idleMs: 15 * MINUTE - 1, active: true }, // just inside
    { idleMs: 15 * MINUTE, active: false }, // exactly 15 idle minutes ends it
  ])("FR-AUTH-03: $idleMs ms since the last request → active $active", ({ idleMs, active }) => {
    const session = { createdAt: CREATED, lastSeenAt: at(10 * MINUTE) };

    expect(isSessionActive(session, at(10 * MINUTE + idleMs), SESSION_POLICY)).toBe(active);
  });
});

describe("auth/session-policy: absolute timeout", () => {
  it.each([
    { ageMs: 120 * MINUTE - 1, active: true },
    { ageMs: 120 * MINUTE, active: false }, // 2 hours ends it, however busy
  ])(
    "FR-AUTH-03: a session $ageMs ms old, in use a minute ago → active $active",
    ({ ageMs, active }) => {
      const session = { createdAt: CREATED, lastSeenAt: at(ageMs - MINUTE) };

      expect(isSessionActive(session, at(ageMs), SESSION_POLICY)).toBe(active);
    },
  );
});

describe("auth/session-policy: step-up freshness", () => {
  it.each([
    { sinceMs: 5 * MINUTE - 1, fresh: true },
    { sinceMs: 5 * MINUTE, fresh: false }, // exactly 5 minutes: ask again
  ])("BR-AUTH-03: a step-up $sinceMs ms ago → fresh $fresh", ({ sinceMs, fresh }) => {
    expect(isStepUpFresh(CREATED, at(sinceMs), STEP_UP_VALID_MS)).toBe(fresh);
  });

  it("BR-AUTH-03: no step-up at all is never fresh", () => {
    expect(isStepUpFresh(null, CREATED, STEP_UP_VALID_MS)).toBe(false);
  });
});
