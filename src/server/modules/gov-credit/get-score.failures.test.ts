import { describe, expect, it } from "vitest";
import { DAY, creditTestSetup, request } from "@/test/credit-setup";
import { aScore, clientError, noHistory, scriptedBureau, timeout } from "@/test/fake-bureau";
import { getScore } from "./index";

describe("gov-credit/getScore: daily budget (BR-CRED-03)", () => {
  it("P1-03: once 5 attempts are used today, the 6th check never reaches the bureau", async () => {
    const scripted = scriptedBureau(Array.from({ length: 5 }, () => aScore(700)));
    const { deps } = creditTestSetup(scripted.bureau);
    // Different customers, so each check misses the cache and needs a call.
    await getScore(request("other-1"), deps);
    await getScore(request("other-2"), deps);
    await getScore(request("other-3"), deps);
    await getScore(request("other-4"), deps);
    await getScore(request("other-5"), deps);

    const sixth = await getScore(request(), deps);

    expect(sixth).toEqual({ ok: false, reason: "budget_exhausted" });
    expect(scripted.calls).toHaveLength(5);
  });
});

describe("gov-credit/getScore: no credit history (BR-CRED-06)", () => {
  it("BR-CRED-06: no history is stored as such after one call, with no retry", async () => {
    const scripted = scriptedBureau([noHistory]);
    const { deps, slept } = creditTestSetup(scripted.bureau);
    await getScore(request(), deps);

    const again = await getScore(request(), deps);

    expect(again).toMatchObject({ ok: true, score: null, hasHistory: false, stale: false });
    expect(scripted.calls).toHaveLength(1);
    expect(slept).toEqual([]);
  });
});

describe("gov-credit/getScore: stale fallback (BR-CRED-02)", () => {
  it.each([
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
});

describe("gov-credit/getScore: retry and cool-down (BR-CRED-05)", () => {
  it("P1-01: two timeouts use two calls, then the next check is refused while cooling down", async () => {
    const scripted = scriptedBureau([timeout, timeout]);
    const { deps, slept } = creditTestSetup(scripted.bureau);
    const first = await getScore(request(), deps);

    const next = await getScore(request("other-customer"), deps);

    expect(first).toEqual({ ok: false, reason: "unavailable" });
    expect(slept).toEqual([1_000]);
    expect(next).toEqual({ ok: false, reason: "cooling_down" });
    expect(scripted.calls).toHaveLength(2);
  });
});

describe("gov-credit/getScore: a 429 blocks calls until Retry-After (BR-CRED-04)", () => {
  const HOUR = 60 * 60_000;

  it.each([
    { waitedMs: 2 * HOUR - 1, result: { ok: false, reason: "blocked" }, calls: 1 },
    { waitedMs: 2 * HOUR, result: { ok: true, score: 700 }, calls: 2 },
  ])("P1-02: $waitedMs ms after a 429 → $result", async ({ waitedMs, result, calls }) => {
    const retryAfter = new Date("2026-10-03T06:30:00.000Z"); // two hours after the 429
    const scripted = scriptedBureau([{ kind: "rate_limited", retryAfter }, aScore(700)]);
    const { deps, advance } = creditTestSetup(scripted.bureau);
    await getScore(request(), deps);
    advance(waitedMs);

    expect(await getScore(request("other-customer"), deps)).toMatchObject(result);
    expect(scripted.calls).toHaveLength(calls);
  });
});
