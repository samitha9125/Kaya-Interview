import { beforeEach, describe, expect, it } from "vitest";
import { createAuditLog } from "@/server/platform/audit";
import type { DatabaseHandle } from "@/server/platform/db";
import { createRateLimiter } from "@/server/platform/rate-limit";
import { aCustomer, CUSTOMER_PASSWORD } from "@/test/builders/customer";
import { createTestDatabase } from "@/test/database";
import { movableClock, sequentialIds, TEST_ENCRYPTION_KEY } from "@/test/fakes";
import { createCustomer, login, type AuthDeps } from "./index";

const MINUTE = 60_000;
const WRONG = "not the password";

let handle: DatabaseHandle;
let deps: AuthDeps;
let attempt = 0;
const customer = aCustomer({ id: "customer-a", customerNumber: "C1001" });

// A generous IP allowance, so lockout is tested on its own.
beforeEach(() => {
  handle = createTestDatabase();
  const time = movableClock();
  deps = {
    db: handle.db,
    audit: createAuditLog({ clock: time.clock, ids: sequentialIds("audit") }),
    clock: time.clock,
    loginLimiter: createRateLimiter({ limit: 1_000, windowMs: 15 * MINUTE, clock: time.clock }),
  };
  createCustomer(handle.db, customer, TEST_ENCRYPTION_KEY);
});

function signIn(password: string, customerNumber = customer.customerNumber, ip = "203.0.113.7") {
  attempt += 1;
  return login({ customerNumber, password, ip, correlationId: `corr-${attempt}` }, deps);
}

// Attempts run one after another, as a person would make them.
async function signInRepeatedly(times: number, password: string, customerNumber?: string) {
  for (let made = 0; made < times; made += 1) await signIn(password, customerNumber);
}

const failTimes = (times: number) => signInRepeatedly(times, WRONG);

describe("auth/login: lockout (BR-AUTH-02)", () => {
  it("P0-13: a locked account looks the same as a wrong password, so a lock reveals nothing", async () => {
    await failTimes(5);

    const locked = await signIn(CUSTOMER_PASSWORD);
    const unknown = await signIn(WRONG, "C9999");

    expect(locked).toEqual(unknown);
  });
});
