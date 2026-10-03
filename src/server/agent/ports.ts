import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

export type ReasoningEffort = "low" | "none";

export type ModelRequest = {
  modelId: string;
  // null leaves the model's own default in place.
  reasoningEffort: ReasoningEffort | null;
  maxOutputTokens: number;
};

// ARCHITECTURE §5: the agent's only way to a model. The adapter owns the
// provider's privacy settings; the agent owns which model and how much
// output. Retries belong to the agent's middleware (FR-AGT-12), so an
// adapter must not retry on its own.
export type ChatModelProvider = { chatModel: (request: ModelRequest) => BaseChatModel };
