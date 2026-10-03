import "server-only";
import { z } from "zod";
import type { CatalogModel, CatalogResult, ModelCatalog } from "@/server/modules/settings";

const OPENROUTER_API = "https://openrouter.ai/api/v1";
const TIMEOUT_MS = 5_000;

// OpenRouter quotes US dollars per token as a decimal string. "-1" marks a
// router with no fixed price, which the schema leaves out.
const PricePerToken = z.string().regex(/^\d+(\.\d+)?$/);
const MICRO_USD_PER_MTOK = 1e12;

const Model = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  context_length: z.int().positive(),
  pricing: z.object({ prompt: PricePerToken, completion: PricePerToken }),
  supported_parameters: z.array(z.string()),
});
const ModelList = z.object({ data: z.array(z.unknown()) });

type Options = { baseURL?: string };

export class OpenRouterCatalog implements ModelCatalog {
  private readonly url: string;

  constructor({ baseURL = OPENROUTER_API }: Options = {}) {
    this.url = `${baseURL}/models?supported_parameters=tools`;
  }

  async listToolModels(): Promise<CatalogResult> {
    try {
      const response = await fetch(this.url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: "error",
      });
      if (!response.ok) return { ok: false };
      const list = ModelList.safeParse(await response.json());
      if (!list.success) return { ok: false };
      return { ok: true, models: list.data.data.flatMap(toolModel) };
    } catch {
      return { ok: false };
    }
  }
}

// Each entry is validated on its own: one malformed model is left out
// rather than hiding the whole list. Tool support is checked here too,
// whatever the query asked for (FR-SET-02).
function toolModel(entry: unknown): CatalogModel[] {
  const parsed = Model.safeParse(entry);
  if (!parsed.success || !parsed.data.supported_parameters.includes("tools")) return [];
  const { id, name, context_length, pricing } = parsed.data;
  return [
    {
      id,
      name,
      contextLength: context_length,
      inputMicroUsdPerMTok: Math.round(Number(pricing.prompt) * MICRO_USD_PER_MTOK),
      outputMicroUsdPerMTok: Math.round(Number(pricing.completion) * MICRO_USD_PER_MTOK),
    },
  ];
}
