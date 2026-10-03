import { describe, expect, it } from "vitest";
import { DAY, creditTestSetup, request } from "@/test/credit-setup";
import { aScore, clientError, scriptedBureau } from "@/test/fake-bureau";
import { getScore, type GovCreditDeps } from "./index";

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
