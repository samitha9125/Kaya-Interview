import { OpenRouterProvider } from "@/server/adapters/openrouter-provider";
import { modelRequestFor } from "@/server/agent/models";
import { AGENT_ROLES, DEFAULT_MODELS } from "@/server/modules/settings";
import { getConfig } from "@/server/platform/config";

// `pnpm smoke:models`: one live call per default model through the real
// adapter (T13 verify). The prompt asks for far more than 400 tokens, so
// the usage shows whether reasoning tokens count toward the limit: if
// output tokens stop at the limit while reasoning tokens are part of them,
// they do (plan risk "Reasoning tokens eat the 400-token output limit").
const PROMPT = "Write the numbers from one to five hundred in words, separated by commas.";

async function main() {
  const { OPENROUTER_API_KEY } = getConfig();
  if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is not set.");
  const provider = new OpenRouterProvider({ apiKey: OPENROUTER_API_KEY });
  for (const role of AGENT_ROLES) {
    const request = modelRequestFor(role, DEFAULT_MODELS[role]);
    const started = performance.now();
    try {
      const reply = await provider.chatModel(request).invoke(PROMPT);
      console.log(
        JSON.stringify({
          role,
          model: request.modelId,
          reasoningEffort: request.reasoningEffort,
          ms: Math.round(performance.now() - started),
          visibleChars: reply.text.length,
          usage: reply.usage_metadata,
          finishReason: reply.response_metadata.finish_reason,
        }),
      );
    } catch (error) {
      console.log(JSON.stringify({ role, model: request.modelId, error: String(error) }));
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
