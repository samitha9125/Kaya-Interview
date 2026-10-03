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
