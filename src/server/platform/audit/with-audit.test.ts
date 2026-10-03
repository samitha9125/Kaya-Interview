import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase } from "@/test/database";
import { fixedClock, sequentialIds } from "@/test/fakes";
import type { DatabaseHandle, DbExecutor } from "../db";
import { createAuditLog, findAuditEvents } from "./audit-log";
import { writeWithAudit } from "./with-audit";

let handle: DatabaseHandle;
const audit = createAuditLog({ clock: fixedClock(), ids: sequentialIds("audit") });
const event = { type: "lending.decided", correlationId: "corr-1", actor: "customer:C1001" };

// A stand-in for a module's decision table; the helper doesn't care which.
beforeEach(() => {
  handle = createTestDatabase();
  handle.db.run(sql`CREATE TABLE decisions (id TEXT PRIMARY KEY)`);
});

function storeDecision(tx: DbExecutor) {
  tx.run(sql`INSERT INTO decisions (id) VALUES ('d1')`);
  return { result: "d1", event };
}

function countDecisions(): number {
  return handle.sqlite.prepare("SELECT count(*) AS n FROM decisions").pluck().get() as number;
}

// A real database failure on the audit insert, not a fake of our own code.
function makeAuditInsertsFail() {
  handle.db.run(
    sql`CREATE TRIGGER fail_audit BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT, 'disk full'); END`,
  );
}

describe("platform/audit: decision and audit in one transaction", () => {
  it("FR-PLAT-04: a decision and its audit record are both stored", () => {
    const result = writeWithAudit(handle.db, audit, storeDecision);

    expect(result).toBe("d1");
    expect(countDecisions()).toBe(1);
    expect(findAuditEvents(handle.db, "corr-1")).toHaveLength(1);
  });

  it("P0-17: a failed audit write leaves no decision stored", () => {
    makeAuditInsertsFail();

    expect(() => writeWithAudit(handle.db, audit, storeDecision)).toThrow(/disk full/);
    expect(countDecisions()).toBe(0);
  });

  it("P0-17: a failed decision leaves no audit record", () => {
    const failingDecision = (tx: DbExecutor) => {
      tx.run(sql`INSERT INTO decisions (id) VALUES ('d1')`);
      throw new Error("rule engine bug");
    };

    expect(() => writeWithAudit(handle.db, audit, failingDecision)).toThrow(/rule engine bug/);
    expect(countDecisions()).toBe(0);
    expect(findAuditEvents(handle.db, "corr-1")).toHaveLength(0);
  });
});
