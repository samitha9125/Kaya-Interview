import { runInTransaction, type AppDatabase, type DbExecutor } from "../db";
import type { AuditEvent, AuditLog } from "./audit-log";

// FR-PLAT-04: a decision and its audit record commit together or not at
// all, so no decision can exist without its trail.
export function writeWithAudit<T>(
  db: AppDatabase,
  audit: AuditLog,
  work: (tx: DbExecutor) => { result: T; event: AuditEvent },
): T {
  return runInTransaction(db, (tx) => {
    const { result, event } = work(tx);
    audit.record(tx, event);
    return result;
  });
}
