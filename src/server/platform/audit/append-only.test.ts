import { beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase } from "@/test/database";
import { fixedClock, sequentialIds } from "@/test/fakes";
import type { DatabaseHandle } from "../db";
import { createAuditLog } from "./audit-log";

let handle: DatabaseHandle;

// Raw SQL on purpose: the module API has no update or delete, so the
// triggers are what stop anyone else changing the record.
beforeEach(() => {
  handle = createTestDatabase();
  const audit = createAuditLog({ clock: fixedClock(), ids: sequentialIds("audit") });
  audit.record(handle.db, { type: "auth.login", correlationId: "corr-1", actor: "customer:C1001" });
});

describe("platform/audit: append-only at the database (FR-PLAT-03)", () => {
  it.each([
    { statement: "UPDATE audit_events SET type = 'auth.logout'" },
    { statement: "DELETE FROM audit_events" },
  ])("FR-PLAT-03: '$statement' is refused", ({ statement }) => {
    expect(() => handle.sqlite.prepare(statement).run()).toThrow(/append-only/);
    expect(handle.sqlite.prepare("SELECT type FROM audit_events").pluck().all()).toEqual([
      "auth.login",
    ]);
  });
});
