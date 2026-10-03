import { Command, END, isGraphBubbleUp } from "@langchain/langgraph";
import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from "langchain";
import { z } from "zod";
import { logger } from "@/server/platform/logger";
import { contextOf, type NodeConfig } from "../context";
import { modelRequestFor } from "../models";
import type { ChatModelProvider } from "../ports";
import { TRIAGE_PROMPT } from "../prompts/triage";
import type { ConversationStateValue } from "../state";
import { ASSISTANT_UNAVAILABLE, OTHER_TOPIC } from "../templates";
import { fromBank } from "./endings";

const TriageRoute = z.object({
  route: z
    .enum(["loan", "kyc", "human", "other"])
    .describe("Where the customer's latest message belongs"),
});
type Route = z.infer<typeof TriageRoute>["route"];

// Enough of the conversation to read a short answer such as "yes please".
const RECENT_MESSAGES = 6;
// FR-AGT-12: two retries.
const ATTEMPTS = 3;

// Only what the customer and the assistant said; tool traffic is internal.
const isConversation = (message: BaseMessage) =>
  HumanMessage.isInstance(message) ||
  (AIMessage.isInstance(message) && !message.tool_calls?.length);

async function classify(models: ChatModelProvider, modelId: string, messages: BaseMessage[]) {
  const classifier = models
    .chatModel(modelRequestFor("triage", modelId))
    .withStructuredOutput(TriageRoute)
    .withRetry({ stopAfterAttempt: ATTEMPTS });
  const recent = messages.filter(isConversation).slice(-RECENT_MESSAGES);
  const { route } = TriageRoute.parse(
    await classifier.invoke([new SystemMessage(TRIAGE_PROMPT), ...recent]),
  );
  return route;
}

// FR-AGT-01: triage classifies with structured output, and code acts on
// the label. A route sets the journey, so the next message goes straight
// to the specialist. FR-AGT-15: a message a specialist has just handed
// back isn't sent straight back to it; it gets the redirect instead.
export function createTriageNode(models: ChatModelProvider) {
  return async (state: ConversationStateValue, config: NodeConfig) => {
    const { models: selection, correlationId } = contextOf(config);
    let route: Route;
    try {
      route = await classify(models, selection.triage, state.messages);
    } catch (error) {
      if (isGraphBubbleUp(error)) throw error;
      logger.error("triage failed", { correlationId, error });
      return new Command({ goto: END, update: { messages: [fromBank(ASSISTANT_UNAVAILABLE)] } });
    }
    const update = { handedBackFrom: null };
    if (route === state.handedBackFrom || route === "other") {
      return new Command({ goto: END, update: { ...update, messages: [fromBank(OTHER_TOPIC)] } });
    }
    if (route === "human") return new Command({ goto: "callback", update });
    return new Command({ goto: `${route}_agent`, update: { ...update, journey: route } });
  };
}
