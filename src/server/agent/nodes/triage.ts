import { Command, END, isGraphBubbleUp } from "@langchain/langgraph";
import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from "langchain";
import { z } from "zod";
import { logger } from "@/server/platform/logger";
import { contextOf, type NodeConfig } from "../context";
import { modelRequestFor } from "../models";
import type { ChatModelProvider } from "../ports";
import { tokensOf, type RecordAudit } from "../middleware/audit-trail";
import { TRIAGE_PROMPT, TRIAGE_PROMPT_VERSION } from "../prompts/triage";
import type { ConversationStateValue } from "../state";
import { ASSISTANT_UNAVAILABLE, OTHER_TOPIC } from "../templates";
import { AGENT_POLICY } from "../config";
import { fromBank } from "./endings";

const TriageRoute = z.object({
  route: z
    .enum(["loan", "kyc", "human", "other"])
    .describe("Where the customer's latest message belongs"),
});
type Route = z.infer<typeof TriageRoute>["route"];

// Only what the customer and the assistant said; tool traffic is internal.
const isConversation = (message: BaseMessage) =>
  HumanMessage.isInstance(message) ||
  (AIMessage.isInstance(message) && !message.tool_calls?.length);

async function classify(models: ChatModelProvider, modelId: string, messages: BaseMessage[]) {
  const classifier = models
    .chatModel(modelRequestFor("triage", modelId))
    .withStructuredOutput(TriageRoute, { includeRaw: true })
    .withRetry({ stopAfterAttempt: AGENT_POLICY.triageAttempts });
  const recent = messages.filter(isConversation).slice(-AGENT_POLICY.triageRecentMessages);
  const { raw, parsed } = await classifier.invoke([new SystemMessage(TRIAGE_PROMPT), ...recent]);
  return { route: TriageRoute.parse(parsed).route, tokens: tokensOf(raw) };
}

// FR-AGT-01: triage classifies with structured output, and code acts on
// the label. A route sets the journey, so the next message goes straight
// to the specialist. FR-AGT-15: a message a specialist has just handed
// back isn't sent straight back to it; it gets the redirect instead.
export function createTriageNode(models: ChatModelProvider, record: RecordAudit) {
  return async (state: ConversationStateValue, config: NodeConfig) => {
    const { models: selection, correlationId, conversationId } = contextOf(config);
    let route: Route;
    let tokens: ReturnType<typeof tokensOf>;
    try {
      ({ route, tokens } = await classify(models, selection.triage, state.messages));
    } catch (error) {
      if (isGraphBubbleUp(error)) throw error;
      logger.error("triage failed", { correlationId, error });
      return new Command({ goto: END, update: { messages: [fromBank(ASSISTANT_UNAVAILABLE)] } });
    }
    // ARCHITECTURE §12: triage's one reply is its route.
    record({
      type: "agent.reply",
      correlationId,
      conversationId,
      actor: "agent:triage",
      model: selection.triage,
      promptVersion: TRIAGE_PROMPT_VERSION,
      payload: { role: "triage", route, tokens },
    });
    const update = { handedBackFrom: null };
    if (route === state.handedBackFrom || route === "other") {
      return new Command({ goto: END, update: { ...update, messages: [fromBank(OTHER_TOPIC)] } });
    }
    if (route === "human") return new Command({ goto: "callback", update });
    return new Command({ goto: `${route}_agent`, update: { ...update, journey: route } });
  };
}
