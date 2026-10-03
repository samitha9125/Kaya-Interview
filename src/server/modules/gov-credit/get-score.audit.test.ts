import { describe, expect, it } from "vitest";
import { findAuditEvents } from "@/server/platform/audit";
import { DAY, creditTestSetup, request } from "@/test/credit-setup";
import { aScore, clientError, scriptedBureau } from "@/test/fake-bureau";
import { ageScoreCache, cachedScoreStatus, getScore, type GovCreditDeps } from "./index";

const eventsOf = (deps: GovCreditDeps, type: string) =>
  findAuditEvents(deps.db, "corr-1").filter((event) => event.type === type);

describe("gov-credit/getScore: what the audit shows (FR-PLAT-03)", () => {
  it("BR-CRED-01: a fresh cache entry is recorded as a cache hit, with no bureau call", async () => {
    const scripted = scriptedBureau([aScore(700)]);
    const { deps, advance } = creditTestSetup(scripted.bureau);
    await getScore(request(), deps);
    advance(3 * DAY);

    await getScore(request(), deps);

    expect(scripted.calls).toHaveLength(1);
    expect(eventsOf(deps, "gov.cache_hit")).toMatchObject([{ payload: { ageDays: 3 } }]);
  });

  it("BR-CRED-03: each call records its number against the day's allowance", async () => {
    const { deps } = creditTestSetup(scriptedBureau([aScore(700)]).bureau);

    await getScore(request(), deps);

    expect(eventsOf(deps, "gov.call")).toMatchObject([
      { payload: { callNumber: 1, callsPerDay: 5 } },
    ]);
  });

  it("BR-CRED-03: with the day's calls used up, the check is recorded as skipped", async () => {
    const scripted = scriptedBureau([aScore(700)], 1);
    const { deps } = creditTestSetup(scripted.bureau);
    await getScore(request("other"), deps);

    await getScore(request(), deps);

    expect(scripted.calls).toHaveLength(1);
    expect(eventsOf(deps, "gov.call_skipped")).toMatchObject([
      { payload: { reason: "budget_exhausted", callsPerDay: 1, servedStaleDays: null } },
    ]);
  });

  it("FR-PLAT-06: no audit event carries the score", async () => {
    const { deps, advance } = creditTestSetup(scriptedBureau([aScore(712), clientError]).bureau);
    await getScore(request(), deps);
    advance(3 * DAY);
    await getScore(request(), deps);
    advance(30 * DAY);

    await getScore(request(), deps);

    expect(JSON.stringify(findAuditEvents(deps.db, "corr-1"))).not.toContain("712");
  });
});

describe("gov-credit/ageScoreCache: the demo control", () => {
  it("BR-CRED-02: one press ends the lifetime, so a failing bureau falls back to the stale score", async () => {
    const { deps } = creditTestSetup(scriptedBureau([aScore(700), clientError]).bureau);
    await getScore(request(), deps);

    ageScoreCache(deps.db);
    const result = await getScore(request(), deps);

    expect(result).toMatchObject({ ok: true, score: 700, stale: true });
    expect(eventsOf(deps, "gov.call_skipped")).toMatchObject([
      { payload: { reason: "call_failed", servedStaleDays: 31 } },
    ]);
  });

  it("BR-CRED-02: three presses take a score past the 90-day stale window", async () => {
    const { deps } = creditTestSetup(scriptedBureau([aScore(700)]).bureau);
    await getScore(request(), deps);

    ageScoreCache(deps.db);
    ageScoreCache(deps.db);
    ageScoreCache(deps.db);

    expect(cachedScoreStatus(deps.db, "customer-a", deps.clock.now(), 30)).toEqual({
      state: "too_old",
      ageDays: 93,
    });
  });
});
