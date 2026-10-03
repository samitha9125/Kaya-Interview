import { beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase } from "@/test/database";
import { fixedClock, sequentialIds } from "@/test/fakes";
import type { DatabaseHandle } from "../db";
import { createAuditLog, findAuditEvents } from "./audit-log";

// secret-scan:ignore
const fakeNic = "199012345678";

let handle: DatabaseHandle;
const audit = createAuditLog({ clock: fixedClock(), ids: sequentialIds("audit") });

beforeEach(() => {
  handle = createTestDatabase();
});

function recordLogin() {
  audit.record(handle.db, {
    type: "auth.login_succeeded",
    correlationId: "corr-1",
    actor: "customer:C1001",
    conversationId: "conv-1",
    payload: { method: "password" },
    model: "z-ai/glm-5.3-flash",
    promptVersion: "loan-v1",
  });
}

describe("platform/audit: append-only log", () => {
  it("FR-PLAT-03: an event is stored with its correlation ID, model and prompt version", () => {
    recordLogin();

    expect(findAuditEvents(handle.db, "corr-1")).toEqual([
      {
        id: "audit-1",
        at: new Date("2026-10-03T10:00:00.000Z"),
        correlationId: "corr-1",
        conversationId: "conv-1",
        actor: "customer:C1001",
        type: "auth.login_succeeded",
        payload: { method: "password" },
        model: "z-ai/glm-5.3-flash",
        promptVersion: "loan-v1",
      },
    ]);
  });

  it("FR-PLAT-03: personal data in the payload is redacted before it is stored", () => {
    audit.record(handle.db, {
      type: "chat.message_received",
      correlationId: "corr-2",
      actor: "guest:s1",
      payload: { text: `my NIC is ${fakeNic}`, password: "hunter2", score: 742 },
    });

    const [event] = findAuditEvents(handle.db, "corr-2");
    expect(event?.payload).toEqual({
      text: "my NIC is [NIC]",
      password: "[REDACTED]",
      score: "[REDACTED]",
    });
  });

  it.each([
    { kind: "UPDATE", statement: "UPDATE audit_events SET type = 'forged'" },
    { kind: "DELETE", statement: "DELETE FROM audit_events" },
  ])("FR-PLAT-03: even a raw SQL $kind can't change a stored event", ({ statement }) => {
    recordLogin();

    expect(() => handle.sqlite.exec(statement)).toThrow(/append-only/);
    expect(findAuditEvents(handle.db, "corr-1")).toHaveLength(1);
  });
});
