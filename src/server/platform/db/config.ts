export const DEFAULT_DATABASE_PATH = "bank.db";
export const MIGRATIONS_FOLDER = "drizzle";

// How long SQLite waits for another writer before reporting SQLITE_BUSY.
export const BUSY_TIMEOUT_MS = 5_000;
// Whole-transaction retries after SQLITE_BUSY. Waiting can't resolve every
// case (a WAL snapshot that went stale has to start again), retrying can.
export const BUSY_RETRIES = 2;
