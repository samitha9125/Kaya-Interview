import type { Clock } from "@/server/platform/clock";
import type { IdGenerator } from "@/server/platform/ids";

export function fixedClock(iso = "2026-10-03T10:00:00.000Z"): Clock {
  return { now: () => new Date(iso) };
}

// A clock a test moves forward by hand, so time-based rules run without
// real timers.
export function movableClock(iso = "2026-10-03T10:00:00.000Z") {
  let nowMs = new Date(iso).getTime();
  const clock: Clock = { now: () => new Date(nowMs) };
  return { clock, advance: (ms: number) => void (nowMs += ms) };
}

export function sequentialIds(prefix = "id"): IdGenerator {
  let next = 0;
  return { newId: () => `${prefix}-${++next}` };
}

// Obviously fake, fixed key for field encryption in tests.
export const TEST_ENCRYPTION_KEY = Buffer.alloc(32, 1);
