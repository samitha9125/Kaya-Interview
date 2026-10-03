import { beforeEach, describe, expect, it } from "vitest";
import { login } from "@/server/modules/auth";
import { createAuditLog } from "@/server/platform/audit";
import type { DatabaseHandle } from "@/server/platform/db";
import { createRateLimiter } from "@/server/platform/rate-limit";
import { createTestDatabase } from "@/test/database";
import { fixedClock, sequentialIds, TEST_ENCRYPTION_KEY } from "@/test/fakes";
import { DEMO_CUSTOMERS, DEMO_PASSWORD, seedDemoCustomers } from "./demo-customers";

const LOW_COST = { cost: 2 ** 10 };
const clock = fixedClock();
const audit = createAuditLog({ clock, ids: sequentialIds("audit") });
let handle: DatabaseHandle;

beforeEach(() => {
  handle = createTestDatabase();
});

function countCustomers(): number {
  return handle.sqlite.prepare("SELECT count(*) FROM customers").pluck().get() as number;
}

function signIn(customerNumber: string) {
  return login(
    { customerNumber, password: DEMO_PASSWORD, ip: "203.0.113.7", correlationId: "seed-check" },
    {
      db: handle.db,
      clock,
      audit,
      loginLimiter: createRateLimiter({ limit: 10, windowMs: 60_000, clock }),
    },
  );
}

describe("seed: demo customers", () => {
  it("FR-PLAT-07: every demo customer can sign in with the demo password", async () => {
    await seedDemoCustomers(handle.db, TEST_ENCRYPTION_KEY, LOW_COST);

    const results = await Promise.all(DEMO_CUSTOMERS.map((demo) => signIn(demo.customerNumber)));

    expect(results.every((result) => result.ok)).toBe(true);
  });

  it("FR-PLAT-07: re-running the seed adds nobody and keeps existing records", async () => {
    await seedDemoCustomers(handle.db, TEST_ENCRYPTION_KEY, LOW_COST);
    handle.sqlite
      .prepare("UPDATE customers SET failed_login_count = 3 WHERE id = 'cust-1001'")
      .run();

    await seedDemoCustomers(handle.db, TEST_ENCRYPTION_KEY, LOW_COST);

    const failed = handle.sqlite
      .prepare("SELECT failed_login_count FROM customers WHERE id = 'cust-1001'")
      .pluck()
      .get();
    expect(countCustomers()).toBe(DEMO_CUSTOMERS.length);
    expect(failed).toBe(3);
  });

  it("FR-PLAT-07: a customer with no income on record exists, for the hard-referral demo", () => {
    expect(DEMO_CUSTOMERS.some((demo) => demo.monthlyIncomeLkr === null)).toBe(true);
  });
});
