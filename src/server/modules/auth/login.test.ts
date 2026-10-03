import { beforeEach, describe, expect, it } from "vitest";
import { createAuditLog, findAuditEvents } from "@/server/platform/audit";
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
let advance: (ms: number) => void;
let attempt = 0;
const customer = aCustomer({ id: "customer-a", customerNumber: "C1001" });

// A generous IP allowance, so lockout is tested on its own. The IP limit
// has its own tests below.
beforeEach(() => {
  handle = createTestDatabase();
  const time = movableClock();
  advance = time.advance;
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

describe("auth/login: credentials", () => {
  it("FR-AUTH-01: the right customer number and password sign the customer in", async () => {
    await expect(signIn(CUSTOMER_PASSWORD)).resolves.toEqual({
      ok: true,
      customerId: "customer-a",
    });
  });

  it("FR-AUTH-01: an unknown customer number and a wrong password give the same answer", async () => {
    const unknown = await signIn(CUSTOMER_PASSWORD, "C9999");
    const wrong = await signIn(WRONG);

    expect(unknown).toEqual({ ok: false, reason: "invalid_credentials" });
    expect(wrong).toEqual(unknown);
  });

  it("FR-AUTH-01: customer numbers match without regard to case or surrounding spaces", async () => {
    await expect(signIn(CUSTOMER_PASSWORD, " c1001 ")).resolves.toEqual({
      ok: true,
      customerId: "customer-a",
    });
  });
});

describe("auth/login: lockout (BR-AUTH-02)", () => {
  it.each([
    { failures: 4, expected: { ok: true, customerId: "customer-a" } },
    { failures: 5, expected: { ok: false, reason: "invalid_credentials" } },
    { failures: 6, expected: { ok: false, reason: "invalid_credentials" } },
  ])(
    "P0-13: after $failures wrong passwords, the right one → $expected.ok",
    async ({ failures, expected }) => {
      await failTimes(failures);

      await expect(signIn(CUSTOMER_PASSWORD)).resolves.toEqual(expected);
    },
  );

  it("P0-13: a locked account looks the same as a wrong password, so a lock reveals nothing", async () => {
    await failTimes(5);

    const locked = await signIn(CUSTOMER_PASSWORD);
    const unknown = await signIn(WRONG, "C9999");

    expect(locked).toEqual(unknown);
  });

  it.each([
    { waitMs: 15 * MINUTE - 1, ok: false },
    { waitMs: 15 * MINUTE, ok: true },
  ])(
    "BR-AUTH-02: $waitMs ms after locking, the right password → ok $ok",
    async ({ waitMs, ok }) => {
      await failTimes(5);
      advance(waitMs);

      const result = await signIn(CUSTOMER_PASSWORD);

      expect(result.ok).toBe(ok);
    },
  );

  it("BR-AUTH-02: a successful sign-in resets the count, so only consecutive failures lock", async () => {
    await failTimes(4);
    await signIn(CUSTOMER_PASSWORD);
    await failTimes(4);

    await expect(signIn(CUSTOMER_PASSWORD)).resolves.toMatchObject({ ok: true });
  });

  it("BR-AUTH-02: the audit trail records why a sign-in was refused", async () => {
    await failTimes(5);
    await signIn(CUSTOMER_PASSWORD);

    const [event] = findAuditEvents(handle.db, `corr-${attempt}`);
    expect(event).toMatchObject({
      type: "auth.login_refused",
      actor: "customer-a",
      payload: { reason: "locked" },
    });
  });
});

describe("auth/login: per-IP limit (FR-AUTH-07)", () => {
  beforeEach(() => {
    deps.loginLimiter = createRateLimiter({ limit: 10, windowMs: 15 * MINUTE, clock: deps.clock });
  });

  it("FR-AUTH-07: the 11th attempt from one IP in 15 minutes is refused as too many attempts", async () => {
    await signInRepeatedly(10, CUSTOMER_PASSWORD);

    await expect(signIn(CUSTOMER_PASSWORD)).resolves.toEqual({
      ok: false,
      reason: "too_many_attempts",
    });
  });

  it("FR-AUTH-07: a refused attempt never checks the password, so it can't count toward lockout", async () => {
    await signInRepeatedly(10, CUSTOMER_PASSWORD, "C9999");
    await failTimes(5);

    await expect(signIn(CUSTOMER_PASSWORD, "C1001", "198.51.100.2")).resolves.toMatchObject({
      ok: true,
    });
  });
});

describe("auth/login: what is stored", () => {
  it("FR-PLAT-06: no audit record contains the password", async () => {
    await signIn(WRONG);
    await signIn(CUSTOMER_PASSWORD);

    const audit = handle.sqlite.prepare("SELECT payload FROM audit_events").pluck().all();
    expect(audit).toHaveLength(2);
    expect(JSON.stringify(audit)).not.toContain(WRONG);
    expect(JSON.stringify(audit)).not.toContain(CUSTOMER_PASSWORD);
  });

  it("FR-PLAT-02: the NIC is stored encrypted, never as plain text", () => {
    const stored = handle.sqlite.prepare("SELECT nic_encrypted FROM customers").pluck().get();

    expect(stored).not.toContain(customer.nic);
    expect(stored).toMatch(/^v1\./);
  });
});
