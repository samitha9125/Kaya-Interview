// Sri Lanka is UTC+05:30 all year (no daylight saving), so a fixed
// offset is exact. The government API's day, and so our daily budget,
// resets at midnight there (SPEC A5, BR-CRED-03).
const OFFSET_MS = (5 * 60 + 30) * 60_000;
const DAY_MS = 24 * 60 * 60_000;

export function sriLankaDay(now: Date): string {
  return new Date(now.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

export function nextSriLankaMidnight(now: Date): Date {
  const localMs = now.getTime() + OFFSET_MS;
  const nextLocalMidnight = Math.floor(localMs / DAY_MS) * DAY_MS + DAY_MS;
  return new Date(nextLocalMidnight - OFFSET_MS);
}
