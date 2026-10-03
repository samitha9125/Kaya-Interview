import "server-only";
import { ChatOpenRouter } from "@langchain/openrouter";
import type { ChatModelProvider, ModelRequest } from "@/server/agent/ports";

// SPEC §7, TD6: only providers that keep no data, and never the China-hosted
// first-party endpoints that serve the default loan model.
const PROVIDER_PREFERENCES = {
  zdr: true,
  data_collection: "deny",
  ignore: ["z-ai", "siliconflow"],
} as const;

type Options = { apiKey: string | undefined; baseURL?: string };

export class OpenRouterProvider implements ChatModelProvider {
  constructor(private readonly options: Options) {}

  chatModel({ modelId, reasoningEffort, maxOutputTokens, needsStructuredOutput }: ModelRequest) {
    return new ChatOpenRouter({
      apiKey: this.options.apiKey,
      baseURL: this.options.baseURL,
      model: modelId,
      maxTokens: maxOutputTokens,
      // Set here, not per call: a per-call provider replaces this whole
      // object, privacy settings included.
      provider: {
        ...PROVIDER_PREFERENCES,
        ignore: [...PROVIDER_PREFERENCES.ignore],
        ...(needsStructuredOutput ? { require_parameters: true } : {}),
      },
      // The package has no typed field for reasoning; modelKwargs is its
      // documented pass-through to the request body.
      ...(reasoningEffort ? { modelKwargs: { reasoning: { effort: reasoningEffort } } } : {}),
      // LangChain retries 6 times by default; FR-AGT-12 allows 2, done by
      // the agent's middleware.
      maxRetries: 0,
    });
  }
}
