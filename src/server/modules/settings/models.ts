import { like } from "drizzle-orm";
import { writeWithAudit, type AuditLog } from "@/server/platform/audit";
import type { Clock } from "@/server/platform/clock";
import type { AppDatabase, DbExecutor } from "@/server/platform/db";
import { AGENT_ROLES, DEFAULT_MODELS, type AgentRole } from "./config";
import type { CatalogModel, ModelCatalog } from "./ports";
import { settings } from "./schema";

export type ModelSelection = Record<AgentRole, string>;

export type SettingsDeps = {
  db: AppDatabase;
  audit: AuditLog;
  clock: Clock;
  catalog: ModelCatalog;
};

export type ModelChange = {
  role: AgentRole;
  modelId: string;
  actor: string;
  correlationId: string;
};
export type ModelChangeResult =
  { ok: true } | { ok: false; reason: "not_listed" | "catalog_unavailable" };

const MODEL_KEY_PREFIX = "model.";

export function currentModels(executor: DbExecutor): ModelSelection {
  const rows = executor
    .select()
    .from(settings)
    .where(like(settings.key, `${MODEL_KEY_PREFIX}%`))
    .all();
  const chosen = new Map(rows.map((row) => [row.key.slice(MODEL_KEY_PREFIX.length), row.value]));
  return Object.fromEntries(
    AGENT_ROLES.map((role) => [role, chosen.get(role) ?? DEFAULT_MODELS[role]]),
  ) as ModelSelection;
}

// FR-SET-02: only a model the catalogue lists as tool-capable can be
// chosen. The route gates this behind demo mode (BR-SET-01).
export async function chooseModel(
  change: ModelChange,
  deps: SettingsDeps,
): Promise<ModelChangeResult> {
  const catalog = await deps.catalog.listToolModels();
  if (!catalog.ok) return { ok: false, reason: "catalog_unavailable" };
  if (!catalog.models.some((model) => model.id === change.modelId)) {
    return { ok: false, reason: "not_listed" };
  }
  return writeWithAudit(deps.db, deps.audit, (tx) => {
    const from = currentModels(tx)[change.role];
    const row = {
      key: `${MODEL_KEY_PREFIX}${change.role}`,
      value: change.modelId,
      updatedAt: deps.clock.now(),
    };
    tx.insert(settings).values(row).onConflictDoUpdate({ target: settings.key, set: row }).run();
    return {
      result: { ok: true },
      event: {
        type: "settings.model_changed",
        correlationId: change.correlationId,
        actor: change.actor,
        payload: { role: change.role, from, to: change.modelId },
      },
    };
  });
}

// P1-08: a chosen model the catalogue no longer lists (removed, or no
// longer tool-capable) is flagged on the Settings screen.
export function modelAvailability(
  selection: ModelSelection,
  listed: CatalogModel[],
): Record<AgentRole, { modelId: string; isListed: boolean }> {
  const ids = new Set(listed.map((model) => model.id));
  return Object.fromEntries(
    AGENT_ROLES.map((role) => [
      role,
      { modelId: selection[role], isListed: ids.has(selection[role]) },
    ]),
  ) as Record<AgentRole, { modelId: string; isListed: boolean }>;
}

// FR-SET-03: the status only. The key itself never leaves the config.
export function apiKeyStatus(key: string | undefined): "configured" | "missing" {
  return key ? "configured" : "missing";
}
