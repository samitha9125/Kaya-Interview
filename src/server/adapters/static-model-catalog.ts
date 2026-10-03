import "server-only";
import type { CatalogResult, ModelCatalog } from "@/server/modules/settings";

// TD25: keyless runs (browser tests, a demo without a key) use a fixed
// catalogue instead of OpenRouter's, so Settings works offline. It lists
// the three defaults at the list prices recorded in DECISIONS (integer
// micro-dollars per 1M tokens, TD17); the context sizes are illustrative.
const MODELS = [
  {
    id: "google/gemini-3.1-flash-lite",
    name: "Gemini 3.1 Flash Lite",
    contextLength: 1_000_000,
    inputMicroUsdPerMTok: 250_000,
    outputMicroUsdPerMTok: 1_500_000,
  },
  {
    id: "z-ai/glm-5.3-flash",
    name: "GLM 5.3 Flash",
    contextLength: 200_000,
    inputMicroUsdPerMTok: 150_000,
    outputMicroUsdPerMTok: 500_000,
  },
  {
    id: "openai/gpt-5.6-luna",
    name: "GPT-5.6 Luna",
    contextLength: 400_000,
    inputMicroUsdPerMTok: 200_000,
    outputMicroUsdPerMTok: 1_200_000,
  },
];

export class StaticModelCatalog implements ModelCatalog {
  async listToolModels(): Promise<CatalogResult> {
    return { ok: true, models: MODELS };
  }
}
