import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createTestDatabase } from "@/test/database";
import { fixedClock } from "@/test/fakes";
import type { DatabaseHandle, DbExecutor } from "../db";
import { createIdempotency, type Idempotency } from "./run-once";

const ApplicationSchema = z.object({ applicationId: z.string() });

let handle: DatabaseHandle;
let idempotency: Idempotency;

// The side effect under test: one row per real submission.
beforeEach(() => {
  handle = createTestDatabase();
  handle.db.run(sql`CREATE TABLE applications (id TEXT PRIMARY KEY)`);
  idempotency = createIdempotency({ db: handle.db, clock: fixedClock() });
});

function submit(id: string) {
  return (tx: DbExecutor) => {
    tx.run(sql`INSERT INTO applications (id) VALUES (${id})`);
    return { applicationId: id };
  };
}

function countApplications(): number {
  return handle.sqlite.prepare("SELECT count(*) FROM applications").pluck().get() as number;
}

const request = { scope: "loan.submit", key: "assessment-1", resultSchema: ApplicationSchema };

describe("platform/idempotency: runOnce", () => {
  it("FR-PLAT-05: the same key returns the original result with no second side effect", () => {
    idempotency.runOnce(request, submit("app-1"));

    const replay = idempotency.runOnce(request, submit("app-2"));

    expect(replay).toEqual({ result: { applicationId: "app-1" }, isReplay: true });
    expect(countApplications()).toBe(1);
  });

  it("FR-PLAT-05: failed work keeps neither its side effect nor the key, so a retry runs", () => {
    const failing = (tx: DbExecutor) => {
      submit("app-1")(tx);
      throw new Error("crashed after the insert");
    };

    expect(() => idempotency.runOnce(request, failing)).toThrow(/crashed/);
    const retry = idempotency.runOnce(request, submit("app-1"));

    expect(retry.isReplay).toBe(false);
    expect(countApplications()).toBe(1);
  });
});
