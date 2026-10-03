import type BetterSqlite3 from "better-sqlite3";
import { migrateDatabase, openDatabase, type DatabaseHandle } from "@/server/platform/db";

// A fresh, fully migrated in-memory database: real SQLite, never a mock.
export function createTestDatabase(): DatabaseHandle {
  const handle = openDatabase(":memory:");
  migrateDatabase(handle.db);
  return handle;
}

// Every row of every table as text: what a reader of the database file
// would see.
export function everythingStored({ sqlite }: DatabaseHandle): string {
  const tables = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .pluck()
    .all() as string[];
  return rowsAsText(sqlite, tables);
}

// The graph's saved state only: the two tables the SQLite checkpointer
// writes.
export function checkpointsStored({ sqlite }: DatabaseHandle): string {
  return rowsAsText(sqlite, ["checkpoints", "writes"]);
}

function rowsAsText(sqlite: BetterSqlite3.Database, tables: string[]): string {
  return tables
    .flatMap((table) => sqlite.prepare(`SELECT * FROM "${table}"`).all())
    .map((row) =>
      Object.values(row as object)
        .map((value) => String(value))
        .join("|"),
    )
    .join("\n");
}
