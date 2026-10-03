import { migrateDatabase, openDatabase, type DatabaseHandle } from "@/server/platform/db";

// A fresh, fully migrated in-memory database: real SQLite, never a mock.
export function createTestDatabase(): DatabaseHandle {
  const handle = openDatabase(":memory:");
  migrateDatabase(handle.db);
  return handle;
}
