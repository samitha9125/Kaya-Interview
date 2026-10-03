import { beforeEach, describe, expect, it } from "vitest";
import { createAuditLog } from "@/server/platform/audit";
import type { DatabaseHandle } from "@/server/platform/db";
import { createTestDatabase } from "@/test/database";
import { fixedClock, sequentialIds } from "@/test/fakes";
import {
  apiKeyStatus,
  chooseModel,
  currentModels,
  DEFAULT_MODELS,
  modelAvailability,
  type CatalogModel,
  type ModelCatalog,
  type SettingsDeps,
} from "./index";

const aModel = (id: string): CatalogModel => ({
  id,
  name: id,
  contextLength: 128_000,
  inputMicroUsdPerMTok: 150_000,
  outputMicroUsdPerMTok: 500_000,
});

const listing = (...ids: string[]): ModelCatalog => ({
  listToolModels: async () => ({ ok: true, models: ids.map(aModel) }),
});
const unreachable: ModelCatalog = { listToolModels: async () => ({ ok: false }) };

let handle: DatabaseHandle;

function deps(catalog: ModelCatalog): SettingsDeps {
  const clock = fixedClock();
  return { db: handle.db, clock, audit: createAuditLog({ clock, ids: sequentialIds() }), catalog };
}

const change = (modelId: string) => ({
  role: "loan" as const,
  modelId,
  actor: "operator",
  correlationId: "corr-1",
});

beforeEach(() => {
  handle = createTestDatabase();
});

describe("settings: model per agent role (FR-SET-01)", () => {
  it("FR-SET-01: with nothing chosen, each role uses its default model", () => {
    expect(currentModels(handle.db)).toEqual(DEFAULT_MODELS);
  });

  it("FR-SET-01: choosing a listed model changes that role only, and is audited", async () => {
    const result = await chooseModel(
      change("anthropic/claude-haiku"),
      deps(listing("anthropic/claude-haiku")),
    );

    const audited = handle.sqlite.prepare("SELECT type, payload FROM audit_events").get();
    expect(result).toEqual({ ok: true });
    expect(currentModels(handle.db)).toEqual({ ...DEFAULT_MODELS, loan: "anthropic/claude-haiku" });
    expect(audited).toEqual({
      type: "settings.model_changed",
      payload: JSON.stringify({
        role: "loan",
        from: DEFAULT_MODELS.loan,
        to: "anthropic/claude-haiku",
      }),
    });
  });

  it("FR-SET-02: a model that isn't in the tool-capable catalogue can't be chosen", async () => {
    const result = await chooseModel(
      change("some/chat-only-model"),
      deps(listing("anthropic/claude-haiku")),
    );

    expect(result).toEqual({ ok: false, reason: "not_listed" });
    expect(currentModels(handle.db)).toEqual(DEFAULT_MODELS);
  });

  it("FR-SET-02: with the catalogue unreachable, nothing changes", async () => {
    const result = await chooseModel(change("anthropic/claude-haiku"), deps(unreachable));

    expect(result).toEqual({ ok: false, reason: "catalog_unavailable" });
    expect(currentModels(handle.db)).toEqual(DEFAULT_MODELS);
  });
});

describe("settings: a chosen model that is no longer listed (FR-SET-02, P1-08)", () => {
  it("P1-08: a selected model missing from the catalogue is flagged; listed ones are not", () => {
    const listed = [aModel(DEFAULT_MODELS.triage), aModel(DEFAULT_MODELS.kyc)];

    expect(modelAvailability(DEFAULT_MODELS, listed)).toEqual({
      triage: { modelId: DEFAULT_MODELS.triage, isListed: true },
      loan: { modelId: DEFAULT_MODELS.loan, isListed: false },
      kyc: { modelId: DEFAULT_MODELS.kyc, isListed: true },
    });
  });
});

describe("settings: API key status (FR-SET-03)", () => {
  it.each([
    { key: "sk-or-v1-made-up", status: "configured" },
    { key: undefined, status: "missing" },
    { key: "", status: "missing" },
  ])("FR-SET-03: key $key → $status, never the value", ({ key, status }) => {
    expect(apiKeyStatus(key)).toBe(status);
  });
});
