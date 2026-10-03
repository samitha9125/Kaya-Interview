import type { AgentRole } from "@/server/modules/settings";
import type { ModelRequest, ReasoningEffort } from "./ports";

// FR-AGT-11: replies are short, and buffered before they're shown (TD4).
export const MAX_REPLY_TOKENS = 400;
// TD6: OpenRouter counts reasoning tokens toward the output limit (GLM at
// "low" used 197 of 400 in the T13 smoke check), so a reasoning role gets
// room for them on top of its 400 visible tokens.
const REASONING_HEADROOM_TOKENS = 400;

// TD6: set explicitly, because GLM defaults to its maximum. Triage only
// classifies, so it keeps its model's default.
const REASONING: Record<AgentRole, ReasoningEffort | null> = {
  triage: null,
  loan: "low",
  kyc: "low",
};

export function modelRequestFor(role: AgentRole, modelId: string): ModelRequest {
  const reasoningEffort = REASONING[role];
  const headroom = reasoningEffort ? REASONING_HEADROOM_TOKENS : 0;
  return {
    modelId,
    reasoningEffort,
    maxOutputTokens: MAX_REPLY_TOKENS + headroom,
    needsStructuredOutput: role === "triage",
  };
}
