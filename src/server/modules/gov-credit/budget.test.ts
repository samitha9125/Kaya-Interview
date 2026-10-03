import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { migrateDatabase, openDatabase, type DatabaseHandle } from "@/server/platform/db";
import { takeSlot } from "./budget";

const NOW = new Date("2026-10-03T04:30:00.000Z");
let folder: string;
let handles: DatabaseHandle[] = [];

// Two connections to one file stand in for two app processes: the case an
// in-process test can't show, because better-sqlite3 runs one statement
// at a time within a process.
function twoConnections() {
  folder = mkdtempSync(join(tmpdir(), "budget-"));
  const path = join(folder, "bank.db");
  const first = openDatabase(path);
  migrateDatabase(first.db);
  handles = [first, openDatabase(path)];
  return handles;
}

afterEach(() => {
  handles.forEach(({ sqlite }) => sqlite.close());
  rmSync(folder, { recursive: true, force: true });
});

describe("gov-credit/budget: taking a slot across connections (FR-CRED-01)", () => {
  it("P1-04: with one slot left, two connections get exactly one between them", () => {
    const [a, b] = twoConnections();
    takeSlot(a!.db, NOW, 5);
    takeSlot(a!.db, NOW, 5);
    takeSlot(a!.db, NOW, 5);
    takeSlot(a!.db, NOW, 5);

    const results = [takeSlot(a!.db, NOW, 5), takeSlot(b!.db, NOW, 5)];

    expect(results.map((result) => result.ok)).toEqual([true, false]);
    expect(a!.sqlite.prepare("SELECT attempts FROM gov_api_budget").pluck().get()).toBe(5);
  });
});
