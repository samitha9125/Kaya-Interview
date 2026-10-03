import { describe, expect, it } from "vitest";
import { DAY, creditTestSetup, request } from "@/test/credit-setup";
import {
  aScore,
  clientError,
  rateLimited,
  scriptedBureau,
  serverError,
  timeout,
} from "@/test/fake-bureau";
import { getScore, resetBudget, type GovCreditDeps } from "./index";

const MINUTE = 60_000;

// Different customers, so each check misses the cache and needs a call.
async function checkCustomers(count: number, deps: GovCreditDeps) {
  for (let n = 0; n < count; n += 1) await getScore(request(`other-${n}`), deps);
}

describe("gov-credit/getScore: daily budget (BR-CRED-03)", () => {
  it("P1-03: once 5 attempts are used today, the 6th check never reaches the bureau", async () => {
    const scripted = scriptedBureau(Array.from({ length: 5 }, () => aScore(700)));
    const { deps } = creditTestSetup(scripted.bureau);
    await checkCustomers(5, deps);

    const sixth = await getScore(request(), deps);

    expect(sixth).toEqual({ ok: false, reason: "budget_exhausted" });
    expect(scripted.calls).toHaveLength(5);
  });

  it("P1-05: failed and timed-out attempts count toward the budget", async () => {
    const scripted = scriptedBureau([timeout, timeout, clientError, clientError, clientError]);
    const { deps, advance } = creditTestSetup(scripted.bureau);
    await getScore(request("a"), deps);
    advance(15 * MINUTE);
    await checkCustomers(3, deps);

    expect(await getScore(request(), deps)).toEqual({ ok: false, reason: "budget_exhausted" });
    expect(scripted.calls).toHaveLength(5);
  });

  it("A5: the budget comes back at midnight Sri Lanka time", async () => {
    const scripted = scriptedBureau([...Array.from({ length: 5 }, () => aScore(700)), aScore(742)]);
    const { deps, advance } = creditTestSetup(scripted.bureau);
    await checkCustomers(5, deps);
    advance(14 * 60 * MINUTE); // 10:00 → midnight in Colombo

    expect(await getScore(request(), deps)).toMatchObject({ ok: true, score: 742 });
  });

  it("FR-SET-04: a budget reset allows a fresh check", async () => {
    const scripted = scriptedBureau([...Array.from({ length: 5 }, () => aScore(700)), aScore(742)]);
    const { deps } = creditTestSetup(scripted.bureau);
    await checkCustomers(5, deps);

    resetBudget(deps.db, deps.clock.now());

    expect(await getScore(request(), deps)).toMatchObject({ ok: true, score: 742 });
  });
});

describe("gov-credit/getScore: one retry, then a cool-down (BR-CRED-05)", () => {
  it.each([{ first: timeout }, { first: serverError }])(
    "P1-01: a retryable failure is retried once after a jittered ~1 s, and the retry's score is used",
    async ({ first }) => {
      const scripted = scriptedBureau([first, aScore(742)]);
      const { deps, slept } = creditTestSetup(scripted.bureau);

      const result = await getScore(request(), deps);

      expect(result).toMatchObject({ ok: true, score: 742 });
      expect(slept).toEqual([1_000]);
      expect(scripted.calls).toHaveLength(2);
    },
  );

  it.each([
    { waitMs: 15 * MINUTE - 1, calls: 2 }, // still cooling down
    { waitMs: 15 * MINUTE, calls: 3 }, // cool-down over
  ])(
    "P1-01: after two failures, a check $waitMs ms later → $calls calls in all",
    async ({ waitMs, calls }) => {
      const scripted = scriptedBureau([timeout, timeout, aScore(742)]);
      const { deps, advance } = creditTestSetup(scripted.bureau);
      expect(await getScore(request(), deps)).toEqual({ ok: false, reason: "unavailable" });
      advance(waitMs);

      await getScore(request(), deps);

      expect(scripted.calls).toHaveLength(calls);
    },
  );

  it("P1-01: a check during the cool-down says so", async () => {
    const { deps } = creditTestSetup(scriptedBureau([timeout, timeout]).bureau);
    await getScore(request(), deps);

    expect(await getScore(request(), deps)).toEqual({ ok: false, reason: "cooling_down" });
  });

  it("BR-CRED-06: a 4xx other than 404 is not retried and starts no cool-down", async () => {
    const scripted = scriptedBureau([clientError, aScore(742)]);
    const { deps } = creditTestSetup(scripted.bureau);

    expect(await getScore(request(), deps)).toEqual({ ok: false, reason: "unavailable" });
    expect(await getScore(request(), deps)).toMatchObject({ ok: true, score: 742 });
    expect(scripted.calls).toHaveLength(2);
  });
});

describe("gov-credit/getScore: 429 (BR-CRED-04)", () => {
  it.each([
    { waitMs: 59 * MINUTE, blocked: true },
    { waitMs: 60 * MINUTE, blocked: false },
  ])(
    "P1-02: blocked until Retry-After; $waitMs ms later → blocked $blocked",
    async ({ waitMs, blocked }) => {
      const { deps, advance } = creditTestSetup(scriptedBureau([]).bureau);
      deps.bureau = scriptedBureau([
        rateLimited(new Date(deps.clock.now().getTime() + 60 * MINUTE)),
        aScore(742),
      ]).bureau;
      await getScore(request(), deps);
      advance(waitMs);

      const result = await getScore(request(), deps);

      expect(result.ok).toBe(!blocked);
    },
  );

  it("P1-02: the check that hits the 429 is told it's blocked", async () => {
    const { deps } = creditTestSetup(scriptedBureau([rateLimited(null)]).bureau);

    expect(await getScore(request(), deps)).toEqual({ ok: false, reason: "blocked" });
  });

  it("BR-CRED-04: without Retry-After, the block lasts until the next Sri Lanka midnight", async () => {
    const scripted = scriptedBureau([rateLimited(null), aScore(742)]);
    const { deps, advance } = creditTestSetup(scripted.bureau);
    await getScore(request(), deps);
    advance(14 * 60 * MINUTE - 1);
    expect(await getScore(request(), deps)).toEqual({ ok: false, reason: "blocked" });
    advance(1);

    expect(await getScore(request(), deps)).toMatchObject({ ok: true, score: 742 });
  });
});

describe("gov-credit/getScore: stale fallback (BR-CRED-02)", () => {
  it.each([
    { ageMs: 40 * DAY, result: { ok: true, score: 700, stale: true } },
    { ageMs: 90 * DAY, result: { ok: true, score: 700, stale: true } },
    { ageMs: 90 * DAY + 1, result: { ok: false, reason: "unavailable" } },
  ])(
    "P0-08: with the bureau failing, a score $ageMs ms old → $result",
    async ({ ageMs, result }) => {
      const { deps, advance } = creditTestSetup(scriptedBureau([aScore(700), clientError]).bureau);
      await getScore(request(), deps);
      advance(ageMs);

      expect(await getScore(request(), deps)).toMatchObject(result);
    },
  );

  it("P1-03: with the budget gone, an older score is used and marked stale", async () => {
    const scripted = scriptedBureau([aScore(700), ...Array.from({ length: 5 }, () => aScore(650))]);
    const { deps, advance } = creditTestSetup(scripted.bureau);
    await getScore(request(), deps);
    advance(31 * DAY);
    await checkCustomers(5, deps);

    expect(await getScore(request(), deps)).toMatchObject({ ok: true, score: 700, stale: true });
  });
});

describe("gov-credit/getScore: the last slot (FR-CRED-01)", () => {
  it("P1-04: two checks racing for the last slot make exactly one call", async () => {
    const scripted = scriptedBureau([...Array.from({ length: 5 }, () => aScore(700))]);
    const { deps } = creditTestSetup(scripted.bureau);
    await checkCustomers(4, deps);

    const results = await Promise.all([getScore(request("x"), deps), getScore(request("y"), deps)]);

    expect(scripted.calls).toHaveLength(5);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
  });
});

describe("gov-credit/getScore: records and missing data", () => {
  it("FR-PLAT-03: each failed attempt is audited with its cause, as the system", async () => {
    const setup = creditTestSetup(scriptedBureau([timeout, serverError]).bureau);

    await getScore(request(), setup.deps);

    const rows = setup.handle.sqlite.prepare("SELECT actor, payload FROM audit_events").all();
    expect(rows).toEqual([
      {
        actor: "system",
        payload: JSON.stringify({
          customerId: "customer-a",
          attempt: 1,
          outcome: "failure",
          cause: "timeout",
        }),
      },
      {
        actor: "system",
        payload: JSON.stringify({
          customerId: "customer-a",
          attempt: 2,
          outcome: "failure",
          cause: "server_error",
        }),
      },
    ]);
  });

  it("BR-AUTH-01: a customer with no NIC on record is unavailable and nothing is called", async () => {
    const scripted = scriptedBureau([aScore(742)]);
    const { deps } = creditTestSetup(scripted.bureau);
    deps.loadNic = () => undefined;

    expect(await getScore(request(), deps)).toEqual({ ok: false, reason: "unavailable" });
    expect(scripted.calls).toEqual([]);
  });
});
