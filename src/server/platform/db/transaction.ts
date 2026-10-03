import type { AppDatabase, DbExecutor } from "./client";
import { BUSY_RETRIES } from "./config";

export function isBusyError(error: unknown): boolean {
  if (!(error instanceof Error) || !("code" in error)) return false;
  return typeof error.code === "string" && error.code.startsWith("SQLITE_BUSY");
}

export function retryWhenBusy<T>(operation: () => T, retries = BUSY_RETRIES): T {
  try {
    return operation();
  } catch (error) {
    if (retries > 0 && isBusyError(error)) return retryWhenBusy(operation, retries - 1);
    throw error;
  }
}

// IMMEDIATE takes the write lock before the first read, so a
// read-then-write (an idempotency check, a budget slot) can't interleave
// with another writer.
export function runInTransaction<T>(db: AppDatabase, work: (tx: DbExecutor) => T): T {
  return retryWhenBusy(() => db.transaction(work, { behavior: "immediate" }));
}
