import { beforeEach, describe, expect, it } from "vitest";
import { createAuditLog, type AuditEvent, type AuditRecord } from "@/server/platform/audit";
import type { DatabaseHandle } from "@/server/platform/db";
import { createTestDatabase } from "@/test/database";
import { movableClock, sequentialIds } from "@/test/fakes";
import { describeEvent, readTimeline } from "./audit-timeline";

const anEvent = (type: string, payload: Record<string, unknown> = {}): AuditRecord => ({
  id: "e1",
  at: new Date("2026-10-03T04:30:00.000Z"),
  correlationId: "corr-1",
  conversationId: "conv-1",
  actor: "system",
  type,
  payload,
  model: null,
  promptVersion: null,
});

describe("harness/audit-timeline: lines for caching and the government limit", () => {
  it.each([
    {
      event: anEvent("gov.cache_hit", { ageDays: 3 }),
      line: "credit score served from cache, fetched 3 days ago: no government call",
    },
    {
      event: anEvent("gov.call", { callNumber: 3, callsPerDay: 5, outcome: "score" }),
      line: "government credit service called (call 3 of 5 today): score received",
    },
    {
      event: anEvent("gov.call_skipped", {
        reason: "budget_exhausted",
        callsPerDay: 5,
        servedStaleDays: null,
      }),
      line: "government call skipped: daily limit reached (5 of 5 used) → no score to fall back on",
    },
    {
      event: anEvent("gov.call_skipped", { reason: "call_failed", servedStaleDays: 31 }),
      line: "no fresh score: the call failed → stale score used, 31 days old",
    },
    {
      event: anEvent("demo.cache_aged", { days: 31 }),
      line: "demo: every cached credit score made 31 days older",
    },
    {
      event: anEvent("demo.failure_mode_set", { mode: "error" }),
      line: 'demo: government service behaviour set to "error"',
    },
  ])("FR-PLAT-03: $event.type → $line", ({ event, line }) => {
    expect(describeEvent(event)).toBe(line);
  });

  it("FR-PLAT-03: a block names the time it ends", () => {
    const blocked = anEvent("gov.call_skipped", {
      reason: "blocked",
      until: "2026-10-03T05:30:00.000Z",
      servedStaleDays: 40,
    });

    expect(describeEvent(blocked)).toMatch(
      /^government call skipped: the service asked us to wait until \d\d:\d\d → stale score used, 40 days old$/,
    );
  });
});

describe("harness/audit-timeline: which events make up a case", () => {
  let handle: DatabaseHandle;
  let record: (event: Omit<AuditEvent, "correlationId">) => void;
  let advance: (ms: number) => void;

  beforeEach(() => {
    handle = createTestDatabase();
    const time = movableClock();
    advance = time.advance;
    const audit = createAuditLog({ clock: time.clock, ids: sequentialIds("audit") });
    record = (event) => {
      audit.record(handle.db, { correlationId: `corr-${event.type}`, ...event });
      advance(1_000);
    };
  });

  const typesOf = (events: AuditRecord[]) => events.map((event) => event.type);

  it("FR-PLAT-03: demo controls used during the case are included, in time order", () => {
    record({ type: "demo.cache_aged", actor: "demo-settings" });
    record({ type: "consent.given", actor: "C1", conversationId: "conv-1" });
    record({ type: "demo.limit_reset", actor: "demo-settings" });
    record({ type: "gov.call", actor: "system", conversationId: "conv-1" });

    const events = readTimeline(handle.db, { conversationId: "conv-1", customerId: "C1" });

    expect(typesOf(events)).toEqual(["consent.given", "demo.limit_reset", "gov.call"]);
  });

  it("FR-PLAT-03: another customer's conversation and demo reset are left out", () => {
    const since = new Date("2026-10-03T00:00:00.000Z");
    record({ type: "demo.customer_reset", actor: "C1" });
    record({ type: "demo.customer_reset", actor: "C2" });
    record({ type: "gov.cache_hit", actor: "system", conversationId: "conv-2" });

    const events = readTimeline(handle.db, { conversationId: null, customerId: "C1", since });

    expect(events).toMatchObject([{ type: "demo.customer_reset", actor: "C1" }]);
  });
});
