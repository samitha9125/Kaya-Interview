import BetterSqlite3 from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type { RunResult } from "better-sqlite3";
import { BUSY_TIMEOUT_MS, MIGRATIONS_FOLDER } from "./config";

export type AppDatabase = BetterSQLite3Database;
// The database or an open transaction: both run the same queries.
export type DbExecutor = BaseSQLiteDatabase<"sync", RunResult>;
export type DatabaseHandle = { sqlite: BetterSqlite3.Database; db: AppDatabase };

type OpenOptions = { busyTimeoutMs?: number };

export function openDatabase(path: string, options: OpenOptions = {}): DatabaseHandle {
  const sqlite = new BetterSqlite3(path);
  sqlite.pragma(`busy_timeout = ${options.busyTimeoutMs ?? BUSY_TIMEOUT_MS}`);
  sqlite.pragma("foreign_keys = ON");
  // WAL lets readers carry on while one writer commits.
  if (path !== ":memory:") sqlite.pragma("journal_mode = WAL");
  return { sqlite, db: drizzle(sqlite) };
}

export function migrateDatabase(db: AppDatabase, migrationsFolder = MIGRATIONS_FOLDER): void {
  migrate(db, { migrationsFolder });
}
