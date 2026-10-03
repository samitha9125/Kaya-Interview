import { beforeEach, describe, expect, it } from "vitest";
import { createAuditLog } from "@/server/platform/audit";
import type { DatabaseHandle } from "@/server/platform/db";
import { createRateLimiter } from "@/server/platform/rate-limit";
import { aCustomer, CUSTOMER_PASSWORD } from "@/test/builders/customer";
import { createTestDatabase } from "@/test/database";
import { movableClock, sequentialIds, TEST_ENCRYPTION_KEY } from "@/test/fakes";
import { expectOk } from "@/test/results";
import {
  createCustomer,
  endSession,
  hasFreshStepUp,
  login,
  resolveSession,
  startSession,
  stepUp,
  type SessionDeps,
} from "./index";

const MINUTE = 60_000;
const customer = aCustomer({ id: "customer-a" });

let handle: DatabaseHandle;
let deps: SessionDeps;
let advance: (ms: number) => void;

beforeEach(() => {
  handle = createTestDatabase();
  const time = movableClock();
  advance = time.advance;
  deps = {
    db: handle.db,
    clock: time.clock,
    ids: sequentialIds("session"),
    audit: createAuditLog({ clock: time.clock, ids: sequentialIds("audit") }),
  };
  createCustomer(handle.db, customer, TEST_ENCRYPTION_KEY);
});

const signedIn = () => startSession({ customerId: "customer-a", correlationId: "c" }, deps);
const stepUpWith = (token: string, password: string) =>
  stepUp({ token, password, correlationId: "c" }, deps);

// A customer making a request every 10 minutes.
function useEveryTenMinutes(token: string, totalMinutes: number) {
  for (let minutes = 0; minutes < totalMinutes; minutes += 10) {
    advance(10 * MINUTE);
    resolveSession(token, deps);
  }
}

async function failStepUps(token: string, times: number) {
  for (let made = 0; made < times; made += 1) await stepUpWith(token, "not the password");
}

describe("auth/sessions: tokens (FR-AUTH-02)", () => {
  it("FR-AUTH-02: a session's token resolves to that session", () => {
    const { token, session } = signedIn();

    expect(resolveSession(token, deps)).toEqual({ ok: true, session });
  });

  it("FR-AUTH-02: the token is 256 random bits and only its hash is stored", () => {
    const { token } = signedIn();

    const stored = handle.sqlite.prepare("SELECT * FROM sessions").get();
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(JSON.stringify(stored)).not.toContain(token);
  });

  it("FR-AUTH-02: a database row alone can't be used as a session", () => {
    signedIn();
    const tokenHash = handle.sqlite.prepare("SELECT token_hash FROM sessions").pluck().get();

    expect(resolveSession(String(tokenHash), deps)).toEqual({ ok: false, reason: "invalid" });
  });

  it("FR-AUTH-02: an invented token is not a session", () => {
    expect(resolveSession("not-a-token", deps)).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("auth/sessions: timeouts (FR-AUTH-03)", () => {
  it("FR-AUTH-03: 15 idle minutes end the session", () => {
    const { token } = signedIn();
    advance(15 * MINUTE);

    expect(resolveSession(token, deps)).toEqual({ ok: false, reason: "expired" });
  });

  it("FR-AUTH-03: each request moves the idle clock on", () => {
    const { token } = signedIn();
    advance(10 * MINUTE);
    resolveSession(token, deps);
    advance(10 * MINUTE);

    expect(resolveSession(token, deps).ok).toBe(true);
  });

  it("FR-AUTH-03: a busy session still ends 2 hours after it started", () => {
    const { token } = signedIn();
    useEveryTenMinutes(token, 110);
    advance(10 * MINUTE);

    expect(resolveSession(token, deps)).toEqual({ ok: false, reason: "expired" });
  });
});

describe("auth/sessions: logout (FR-AUTH-04)", () => {
  it("FR-AUTH-04: after logout the same token is refused at once", () => {
    const { token } = signedIn();

    endSession(token, "c", deps);

    expect(resolveSession(token, deps)).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("auth/sessions: guests (FR-AUTH-05)", () => {
  it("FR-AUTH-05: a guest session has no customer", () => {
    const { token } = startSession({ customerId: null, correlationId: "c" }, deps);

    expect(resolveSession(token, deps)).toMatchObject({ ok: true, session: { customerId: null } });
  });

  it("FR-AUTH-05: a guest can't step up, whatever password is given", async () => {
    const { token } = startSession({ customerId: null, correlationId: "c" }, deps);

    await expect(stepUpWith(token, CUSTOMER_PASSWORD)).resolves.toEqual({
      ok: false,
      reason: "not_signed_in",
    });
  });
});

describe("auth/sessions: step-up (BR-AUTH-03)", () => {
  it("FR-AUTH-03: step-up rotates the token: the old one dies, the new one is the same session", async () => {
    const { token, session } = signedIn();

    const result = expectOk(await stepUpWith(token, CUSTOMER_PASSWORD));

    expect(resolveSession(token, deps)).toEqual({ ok: false, reason: "invalid" });
    expect(resolveSession(result.token, deps)).toMatchObject({
      ok: true,
      session: { id: session.id },
    });
  });

  it.each([
    { sinceMs: 5 * MINUTE - 1, fresh: true },
    { sinceMs: 5 * MINUTE, fresh: false },
  ])("BR-AUTH-03: $sinceMs ms after a step-up → fresh $fresh", async ({ sinceMs, fresh }) => {
    const { token } = expectOk(await stepUpWith(signedIn().token, CUSTOMER_PASSWORD));
    advance(sinceMs);

    const { session } = expectOk(resolveSession(token, deps));

    expect(hasFreshStepUp(session, deps.clock.now())).toBe(fresh);
  });

  it("BR-AUTH-03: a wrong password neither steps up nor rotates the token", async () => {
    const { token } = signedIn();

    const result = await stepUpWith(token, "not the password");

    const resolved = resolveSession(token, deps);
    expect(result).toEqual({ ok: false, reason: "invalid_credentials" });
    expect(resolved).toMatchObject({ ok: true, session: { stepUpAt: null } });
  });

  it("BR-AUTH-02: failed step-ups count toward the sign-in lockout", async () => {
    const { token } = signedIn();
    await failStepUps(token, 5);

    const signIn = await login(
      {
        customerNumber: customer.customerNumber,
        password: CUSTOMER_PASSWORD,
        ip: "203.0.113.7",
        correlationId: "c",
      },
      {
        ...deps,
        loginLimiter: createRateLimiter({ limit: 10, windowMs: MINUTE, clock: deps.clock }),
      },
    );

    expect(signIn).toEqual({ ok: false, reason: "invalid_credentials" });
  });
});
