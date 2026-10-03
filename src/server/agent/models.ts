import type { AgentRole } from "@/server/modules/settings";
import type { ModelRequest, ReasoningEffort } from "./ports";

// FR-AGT-11: replies are short, and buffered before they're shown (TD4).
export const MAX_OUTPUT_TOKENS = 400;

// TD6: set explicitly, because GLM defaults to its maximum. Triage only
// classifies, so it keeps its model's default.
const REASONING: Record<AgentRole, ReasoningEffort | null> = {
  triage: null,
  loan: "low",
  kyc: "low",
};

export function modelRequestFor(role: AgentRole, modelId: string): ModelRequest {
  return { modelId, reasoningEffort: REASONING[role], maxOutputTokens: MAX_OUTPUT_TOKENS };
}
