import type { Session } from "@/server/modules/auth";

// Started an hour before the fixed test clock's "now".
export function aSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "session-a",
    customerId: "customer-a",
    stepUpAt: null,
    startedAt: new Date("2026-10-03T09:00:00.000Z"),
    ...overrides,
  };
}
