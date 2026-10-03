import { describe, expect, it } from "vitest";
import { CUSTOMER_NIC, DAY, creditTestSetup, request } from "@/test/credit-setup";
import { aScore, noHistory, scriptedBureau } from "@/test/fake-bureau";
import { getScore } from "./index";

// One after another, as a returning customer would ask. Parallel first
// checks may cost one extra call, which D3 accepts.
async function askRepeatedly(times: number, deps: ReturnType<typeof creditTestSetup>["deps"]) {
  const results = [];
  for (let asked = 0; asked < times; asked += 1) results.push(await getScore(request(), deps));
  return results;
}

function scoreChanged(setup: ReturnType<typeof creditTestSetup>) {
  return setup.handle.sqlite.prepare("SELECT score_changed FROM credit_score_cache").pluck().get();
}

describe("gov-credit/getScore: the cache (BR-CRED-01)", () => {
  it("BR-CRED-01: a first check calls the bureau with the customer's NIC and returns a fresh score", async () => {
    const { bureau, calls } = scriptedBureau([aScore(742)]);
    const { deps } = creditTestSetup(bureau);

    const result = await getScore(request(), deps);

    expect(result).toEqual({
      ok: true,
      score: 742,
      hasHistory: true,
      fetchedAt: deps.clock.now(),
      stale: false,
    });
    expect(calls).toEqual([CUSTOMER_NIC]);
  });

  it.each([
    { ageMs: 30 * DAY - 1, calls: 1 }, // just under 30 days → served from the cache
    { ageMs: 30 * DAY, calls: 2 }, // at 30 days → a new call
  ])(
    "BR-CRED-01: a check $ageMs ms after the first → $calls bureau calls in all",
    async ({ ageMs, calls }) => {
      const scripted = scriptedBureau([aScore(742), aScore(760)]);
      const setup = creditTestSetup(scripted.bureau);
      await getScore(request(), setup.deps);
      setup.advance(ageMs);

      await getScore(request(), setup.deps);

      expect(scripted.calls).toHaveLength(calls);
    },
  );

  it("BR-CRED-07: asking again and again while the score is fresh never reaches the bureau", async () => {
    const scripted = scriptedBureau([aScore(742)]);
    const { deps } = creditTestSetup(scripted.bureau);

    await getScore(request(), deps);

    const results = await askRepeatedly(5, deps);

    expect(scripted.calls).toHaveLength(1);
    expect(results.every((result) => result.ok && result.score === 742)).toBe(true);
  });

  it("TD7: the cache is per customer, so another customer is a new call", async () => {
    const scripted = scriptedBureau([aScore(742), aScore(610)]);
    const { deps } = creditTestSetup(scripted.bureau);
    await getScore(request("customer-a"), deps);

    const other = await getScore(request("customer-b"), deps);

    expect(other).toMatchObject({ ok: true, score: 610 });
  });
});

describe("gov-credit/getScore: no history and change tracking", () => {
  it("BR-CRED-06: no credit history is a result, cached like a score", async () => {
    const scripted = scriptedBureau([noHistory]);
    const { deps } = creditTestSetup(scripted.bureau);

    const first = await getScore(request(), deps);
    const second = await getScore(request(), deps);

    expect(first).toMatchObject({ ok: true, score: null, hasHistory: false, stale: false });
    expect(second).toEqual(first);
    expect(scripted.calls).toHaveLength(1);
  });

  it.each([
    { second: 742, changed: 0 },
    { second: 760, changed: 1 },
  ])(
    "FR-CRED-03: a refetch of 742 then $second records changed = $changed",
    async ({ second, changed }) => {
      const setup = creditTestSetup(scriptedBureau([aScore(742), aScore(second)]).bureau);
      await getScore(request(), setup.deps);
      setup.advance(30 * DAY);

      await getScore(request(), setup.deps);

      expect(scoreChanged(setup)).toBe(changed);
    },
  );

  it("FR-CRED-03: a customer's first fetch has nothing to compare with", async () => {
    const setup = creditTestSetup(scriptedBureau([aScore(742)]).bureau);

    await getScore(request(), setup.deps);

    expect(scoreChanged(setup)).toBeNull();
  });
});

describe("gov-credit/getScore: what is recorded", () => {
  it("FR-PLAT-06: each government call is audited without the NIC or the score", async () => {
    const setup = creditTestSetup(scriptedBureau([aScore(742)]).bureau);

    await getScore(request(), setup.deps);

    const audit = setup.handle.sqlite.prepare("SELECT type, payload FROM audit_events").all();
    expect(audit).toEqual([
      {
        type: "gov.call",
        payload: JSON.stringify({ customerId: "customer-a", attempt: 1, outcome: "score" }),
      },
    ]);
    expect(JSON.stringify(audit)).not.toContain(CUSTOMER_NIC);
    expect(JSON.stringify(audit)).not.toContain("742");
  });

  it("TD7: the cache is keyed by customer ID and holds no NIC", async () => {
    const setup = creditTestSetup(scriptedBureau([aScore(742)]).bureau);

    await getScore(request(), setup.deps);

    const rows = setup.handle.sqlite.prepare("SELECT * FROM credit_score_cache").all();
    expect(JSON.stringify(rows)).not.toContain(CUSTOMER_NIC);
  });
});
