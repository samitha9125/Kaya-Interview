import type { Clock } from "@/server/platform/clock";
import type { IdGenerator } from "@/server/platform/ids";

export function fixedClock(iso = "2026-10-03T10:00:00.000Z"): Clock {
  return { now: () => new Date(iso) };
}

export function sequentialIds(prefix = "id"): IdGenerator {
  let next = 0;
  return { newId: () => `${prefix}-${++next}` };
}
