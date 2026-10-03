import { beforeEach, describe, expect, it } from "vitest";
import { getScore } from "@/server/modules/gov-credit";
import { currentModels, type MockFailureMode } from "@/server/modules/settings";
import { createIdempotency } from "@/server/platform/idempotency";
import { createLogger } from "@/server/platform/logger";
import { creditTestSetup, request as scoreRequest } from "@/test/credit-setup";
import { aScore, scriptedBureau } from "@/test/fake-bureau";
import {
  postClearCache,
  postFailureMode,
  postModelChoice,
  postResetLimit,
  type SettingsRouteDeps,
} from "./settings-routes";

type Calls = { resets: number; modes: MockFailureMode[] };

let setup: ReturnType<typeof creditTestSetup>;
let calls: Calls;
let keys = 0;

// Real settings and credit code on in-memory SQLite; the catalogue and the
// mock's admin routes are faked at their ports.
function depsFor(isDemoMode: boolean, adminWorks = true): SettingsRouteDeps {
  const { db, audit, clock } = setup.deps;
  return {
    db,
    audit,
    clock,
    ids: { newId: () => `id-${++keys}` },
    idempotency: createIdempotency({ db, clock }),
    logger: createLogger({ write: () => {} }),
    config: { DEMO_MODE: isDemoMode },
    credit: setup.deps,
    settings: {
      db,
      audit,
      clock,
      catalog: {
        listToolModels: async () => ({
          ok: true,
          models: [
            {
              id: "openai/gpt-5.6-luna",
              name: "GPT",
              contextLength: 1,
              inputMicroUsdPerMTok: 1,
              outputMicroUsdPerMTok: 1,
            },
          ],
        }),
      },
    },
    mockBureauAdmin: {
      resetDailyLimit: async () => (calls.resets++, adminWorks),
      setFailureMode: async (mode) => (calls.modes.push(mode), adminWorks),
    },
  };
}

beforeEach(() => {
  setup = creditTestSetup(scriptedBureau([aScore(700), aScore(700)]).bureau);
  calls = { resets: 0, modes: [] };
});

const post = (body: Record<string, unknown> = {}) =>
  new Request("http://localhost:3000/api/demo", {
    method: "POST",
    headers: { origin: "http://localhost:3000", host: "localhost:3000" },
    body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), ...body }),
  });

const ROUTES = [
  {
    name: "model choice",
    call: postModelChoice,
    body: { role: "loan", modelId: "openai/gpt-5.6-luna" },
  },
  { name: "reset limit", call: postResetLimit, body: {} },
  { name: "clear cache", call: postClearCache, body: {} },
  { name: "failure mode", call: postFailureMode, body: { mode: "down" } },
];

describe("harness/settings-routes: demo mode gates every write (BR-SET-01)", () => {
  it.each(ROUTES)("P0-15: $name with DEMO_MODE=false → 404 and nothing changes", async (route) => {
    const response = await route.call(post(route.body), depsFor(false));

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(calls).toEqual({ resets: 0, modes: [] });
    expect(currentModels(setup.deps.db).loan).not.toBe("openai/gpt-5.6-luna");
  });
});

describe("harness/settings-routes: the controls (FR-SET-01, 04, 05)", () => {
  it("FR-SET-01: a listed model is saved for its role", async () => {
    const response = await postModelChoice(post(ROUTES[0]!.body), depsFor(true));

    expect(response.status).toBe(200);
    expect(currentModels(setup.deps.db).loan).toBe("openai/gpt-5.6-luna");
  });

  it("FR-SET-02: a model the catalogue doesn't list is refused", async () => {
    const response = await postModelChoice(
      post({ role: "loan", modelId: "some/unlisted-model" }),
      depsFor(true),
    );

    expect(response.status).toBe(400);
  });

  it("FR-SET-04: after a reset, a fresh credit check is allowed", async () => {
    await setup.deps.db.run(
      "INSERT INTO gov_api_budget (id, day, attempts) VALUES (1, '2026-10-03', 5)",
    );
    const exhausted = await getScore(scoreRequest(), setup.deps);

    await postResetLimit(post(), depsFor(true));

    const fresh = await getScore(scoreRequest(), setup.deps);
    expect(exhausted).toMatchObject({ ok: false, reason: "budget_exhausted" });
    expect(fresh).toMatchObject({ ok: true });
    expect(calls.resets).toBe(1);
  });

  it("FR-SET-04: if the mock doesn't respond, the reset says so", async () => {
    const response = await postResetLimit(post(), depsFor(true, false));

    expect(response.status).toBe(502);
  });

  it("FR-SET-05: clearing the cache makes the next check ask the bureau again", async () => {
    await getScore(scoreRequest(), setup.deps);

    await postClearCache(post(), depsFor(true));

    const after = setup.handle.sqlite
      .prepare("SELECT count(*) FROM credit_score_cache")
      .pluck()
      .get();
    expect(after).toBe(0);
  });

  it.each(["normal", "slow", "error", "rate_limited", "down"])(
    "FR-SET-05: failure mode %s is passed to the mock",
    async (mode) => {
      const response = await postFailureMode(post({ mode }), depsFor(true));

      expect(response.status).toBe(200);
      expect(calls.modes).toEqual([mode]);
    },
  );
});
