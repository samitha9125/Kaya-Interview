import { describe, expect, it } from "vitest";
import { nextSriLankaMidnight, sriLankaDay } from "./sri-lanka-day";

describe("platform/time: the Sri Lanka day (UTC+05:30)", () => {
  it.each([
    { utc: "2026-10-03T18:29:59.999Z", day: "2026-10-03" }, // 23:59:59.999 in Colombo
    { utc: "2026-10-03T18:30:00.000Z", day: "2026-10-04" }, // midnight in Colombo
    { utc: "2026-10-03T00:00:00.000Z", day: "2026-10-03" }, // 05:30 in Colombo
  ])("A5: $utc is $day in Sri Lanka", ({ utc, day }) => {
    expect(sriLankaDay(new Date(utc))).toBe(day);
  });

  it.each([
    { utc: "2026-10-03T10:00:00.000Z", next: "2026-10-03T18:30:00.000Z" },
    { utc: "2026-10-03T18:30:00.000Z", next: "2026-10-04T18:30:00.000Z" }, // at midnight → the next one
  ])("A5: the next Sri Lanka midnight after $utc is $next", ({ utc, next }) => {
    expect(nextSriLankaMidnight(new Date(utc)).toISOString()).toBe(next);
  });
});
