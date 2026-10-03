import { describe, expect, it } from "vitest";
import { createTestDatabase } from "@/test/database";
import { openDatabase } from "./client";

describe("platform/db: connection settings", () => {
  it("P2-06: SQLite waits for a busy writer instead of failing at once", () => {
    const { sqlite } = openDatabase(":memory:");

    expect(sqlite.pragma("busy_timeout", { simple: true })).toBe(5_000);
  });

  it("FR-PLAT-05: foreign keys are enforced", () => {
    const { sqlite } = openDatabase(":memory:");

    expect(sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("FR-PLAT-03: migrations create the platform tables", () => {
    const { sqlite } = createTestDatabase();

    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .pluck()
      .all();

    expect(tables).toEqual(expect.arrayContaining(["audit_events", "idempotency_keys"]));
  });
});
