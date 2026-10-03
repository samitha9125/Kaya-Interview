import { z } from "zod";
import { clearScoreCache, resetBudget, type GovCreditDeps } from "@/server/modules/gov-credit";
import {
  AGENT_ROLES,
  chooseModel,
  MOCK_FAILURE_MODES,
  type MockBureauAdmin,
  type SettingsDeps,
} from "@/server/modules/settings";
import { failureResponse } from "./failures";
import { handleRoute, type HarnessDeps } from "./pipeline";

export type SettingsRouteDeps = HarnessDeps & {
  config: { DEMO_MODE: boolean };
  settings: SettingsDeps;
  credit: GovCreditDeps;
  mockBureauAdmin: MockBureauAdmin;
};

const IdempotencyKey = z.uuid();
const ModelBody = z.strictObject({
  role: z.enum(AGENT_ROLES),
  modelId: z.string().min(1).max(200),
  idempotencyKey: IdempotencyKey,
});
const FailureModeBody = z.strictObject({
  mode: z.enum(MOCK_FAILURE_MODES),
  idempotencyKey: IdempotencyKey,
});
const ControlBody = z.strictObject({ idempotencyKey: IdempotencyKey });

// The Settings screen has no sign-in of its own; what guards its writes is
// demo mode (BR-SET-01), so they are audited under one actor.
const ACTOR = "demo-settings";
const done = () => Response.json({ ok: true });

// BR-SET-01, P0-15: outside demo mode these routes don't exist, so the
// answer is a bare 404 before anything else is looked at.
function demoOnly(deps: SettingsRouteDeps, route: () => Promise<Response>): Promise<Response> {
  return deps.config.DEMO_MODE ? route() : Promise.resolve(new Response(null, { status: 404 }));
}

// FR-SET-01/02: a model per role, from the tool-capable catalogue only;
// it applies to new conversations.
export function postModelChoice(request: Request, deps: SettingsRouteDeps) {
  const options = { scope: "settings.model", body: ModelBody, session: "optional" as const };
  return demoOnly(deps, () =>
    handleRoute(request, options, deps, async ({ body, correlationId }) => {
      const change = { role: body.role, modelId: body.modelId, actor: ACTOR, correlationId };
      const result = await chooseModel(change, deps.settings);
      if (result.ok) return done();
      return failureResponse(
        result.reason === "not_listed" ? "invalid_input" : "catalog_unavailable",
        correlationId,
      );
    }),
  );
}

// FR-SET-04: the mock's per-IP counter and our own budget, block and
// cool-down, so a fresh credit check is allowed again.
export function postResetLimit(request: Request, deps: SettingsRouteDeps) {
  const options = { scope: "demo.reset", body: ControlBody, session: "optional" as const };
  return demoOnly(deps, () =>
    handleRoute(request, options, deps, async ({ correlationId }) => {
      if (!(await deps.mockBureauAdmin.resetDailyLimit())) {
        return failureResponse("demo_control_failed", correlationId);
      }
      resetBudget(deps.credit.db, deps.credit.clock.now());
      deps.audit.record(deps.db, { type: "demo.limit_reset", correlationId, actor: ACTOR });
      return done();
    }),
  );
}

// FR-SET-05.
export function postClearCache(request: Request, deps: SettingsRouteDeps) {
  const options = { scope: "demo.cache", body: ControlBody, session: "optional" as const };
  return demoOnly(deps, () =>
    handleRoute(request, options, deps, async ({ correlationId }) => {
      clearScoreCache(deps.credit.db);
      deps.audit.record(deps.db, { type: "demo.cache_cleared", correlationId, actor: ACTOR });
      return done();
    }),
  );
}

// FR-SET-05: the mock's behaviour for every later call (SPEC §6.9).
export function postFailureMode(request: Request, deps: SettingsRouteDeps) {
  const options = { scope: "demo.mode", body: FailureModeBody, session: "optional" as const };
  return demoOnly(deps, () =>
    handleRoute(request, options, deps, async ({ body, correlationId }) => {
      if (!(await deps.mockBureauAdmin.setFailureMode(body.mode))) {
        return failureResponse("demo_control_failed", correlationId);
      }
      deps.audit.record(deps.db, {
        type: "demo.failure_mode_set",
        correlationId,
        actor: ACTOR,
        payload: { mode: body.mode },
      });
      return done();
    }),
  );
}
