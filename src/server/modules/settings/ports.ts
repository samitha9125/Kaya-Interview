import type { MockFailureMode } from "./config";

// Prices are integer micro-dollars per million tokens (TD17: no floats at a
// boundary): $0.15 per 1M tokens is 150_000.
export type CatalogModel = {
  id: string;
  name: string;
  contextLength: number;
  inputMicroUsdPerMTok: number;
  outputMicroUsdPerMTok: number;
};

export type CatalogResult = { ok: true; models: CatalogModel[] } | { ok: false };

// FR-SET-02. Contract: only models that support tool calls are listed, so
// a model that loses tool support drops out like a removed one.
export type ModelCatalog = { listToolModels: () => Promise<CatalogResult> };

// FR-SET-04/05: the demo's controls on the mocked government service,
// reached over HTTP like the service itself. Each says whether it worked.
export type MockBureauAdmin = {
  resetDailyLimit: () => Promise<boolean>;
  setFailureMode: (mode: MockFailureMode) => Promise<boolean>;
};
