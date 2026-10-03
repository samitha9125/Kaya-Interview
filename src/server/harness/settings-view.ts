import {
  AGENT_ROLES,
  apiKeyStatus,
  currentModels,
  MOCK_FAILURE_MODES,
  modelAvailability,
  type AgentRole,
  type CatalogModel,
  type MockFailureMode,
  type SettingsDeps,
} from "@/server/modules/settings";
import { budgetStatus, type GovCreditDeps } from "@/server/modules/gov-credit";
import type { AppConfig } from "@/server/platform/config";
import { currentFailureMode } from "./audit-timeline";

export type SettingsViewDeps = {
  config: Pick<AppConfig, "DEMO_MODE" | "OPENROUTER_API_KEY" | "AUTO_DECISION_THRESHOLD">;
  settings: SettingsDeps;
  credit: GovCreditDeps;
};

export type RoleChoice = { role: AgentRole; modelId: string; isFlagged: boolean };

export type SettingsView = {
  canChange: boolean;
  keyStatus: "configured" | "missing";
  thresholdBp: number;
  // null: the catalogue couldn't be reached, so there's nothing to choose from.
  models: CatalogModel[] | null;
  roles: RoleChoice[];
  failureModes: readonly MockFailureMode[];
  failureMode: string;
  govChecks: { usedToday: number; perDay: number };
};

// What the Settings screen shows, and nothing more: the key's status, never
// the key (FR-SET-03); changes only in demo mode (BR-SET-01).
export async function readSettingsView(deps: SettingsViewDeps): Promise<SettingsView> {
  const selection = currentModels(deps.settings.db);
  const catalog = await deps.settings.catalog.listToolModels();
  const availability = modelAvailability(selection, catalog.ok ? catalog.models : []);
  return {
    canChange: deps.config.DEMO_MODE,
    keyStatus: apiKeyStatus(deps.config.OPENROUTER_API_KEY),
    thresholdBp: deps.config.AUTO_DECISION_THRESHOLD,
    models: catalog.ok ? catalog.models : null,
    // P1-08: only a catalogue that answered can say a model is gone.
    roles: AGENT_ROLES.map((role) => ({
      role,
      modelId: availability[role].modelId,
      isFlagged: catalog.ok && !availability[role].isListed,
    })),
    failureModes: MOCK_FAILURE_MODES,
    failureMode: currentFailureMode(deps.settings.db),
    govChecks: {
      usedToday: budgetStatus(deps.credit.db, deps.credit.clock.now()).usedToday,
      perDay: deps.credit.bureau.callsPerDay,
    },
  };
}
