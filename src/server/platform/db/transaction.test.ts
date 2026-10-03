import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrateDatabase, openDatabase, type DatabaseHandle } from "./client";
import { isBusyError, retryWhenBusy, runInTransaction } from "./transaction";

function busyError(): Error {
  return Object.assign(new Error("database is locked"), { code: "SQLITE_BUSY" });
}

function failingTimes(failures: number, error: () => Error) {
  let calls = 0;
  const operation = () => {
    calls += 1;
    if (calls <= failures) throw error();
    return "done";
  };
  return { operation, calls: () => calls };
}

describe("platform/db: retry when SQLite is busy", () => {
  it("P2-06: a busy failure is retried and then succeeds", () => {
    const { operation, calls } = failingTimes(2, busyError);

    expect(retryWhenBusy(operation)).toBe("done");
    expect(calls()).toBe(3);
  });

  it("P2-06: retries are bounded; the busy error surfaces after them", () => {
    const { operation, calls } = failingTimes(3, busyError);

    expect(() => retryWhenBusy(operation)).toThrow(/locked/);
    expect(calls()).toBe(3);
  });

  it("P2-06: any other error is not retried", () => {
    const { operation, calls } = failingTimes(1, () => new Error("constraint failed"));

    expect(() => retryWhenBusy(operation)).toThrow(/constraint/);
    expect(calls()).toBe(1);
  });

  it.each([
    { value: busyError(), expected: true },
    { value: Object.assign(new Error("x"), { code: "SQLITE_BUSY_SNAPSHOT" }), expected: true },
    { value: Object.assign(new Error("x"), { code: "SQLITE_CONSTRAINT" }), expected: false },
    { value: new Error("x"), expected: false },
    { value: "SQLITE_BUSY", expected: false },
  ])("P2-06: isBusyError($value) → $expected", ({ value, expected }) => {
    expect(isBusyError(value)).toBe(expected);
  });
});

describe("platform/db: two real connections to one file", () => {
  let dir: string;
  let writer: DatabaseHandle;
  let other: DatabaseHandle;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "bank-db-"));
    const path = join(dir, "test.db");
    writer = openDatabase(path);
    migrateDatabase(writer.db);
    other = openDatabase(path, { busyTimeoutMs: 20 });
  });

  afterEach(() => {
    writer.sqlite.close();
    other.sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("P2-06: while another connection holds the write lock, SQLite reports a busy error", () => {
    writer.sqlite.exec("BEGIN IMMEDIATE");

    const attempt = () => runInTransaction(other.db, (tx) => tx.run(sql`SELECT 1`));

    expect(attempt).toThrow(expect.objectContaining({ code: "SQLITE_BUSY" }));
  });

  it("P2-06: once the lock is released, the same transaction goes through", () => {
    writer.sqlite.exec("BEGIN IMMEDIATE");
    expect(() => runInTransaction(other.db, () => "written")).toThrow();
    writer.sqlite.exec("COMMIT");

    const result = runInTransaction(other.db, () => "written");

    expect(result).toBe("written");
  });

  it("P2-06: a file database uses WAL, so readers don't block the writer", () => {
    expect(writer.sqlite.pragma("journal_mode", { simple: true })).toBe("wal");
  });
});
