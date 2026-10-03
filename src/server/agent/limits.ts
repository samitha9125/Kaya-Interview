import { AIMessage, type BaseMessage } from "langchain";
import { BANK_AUTHOR } from "./nodes/endings";

// FR-AGT-11.
export const CALL_LIMITS = {
  modelCallsPerTurn: 5,
  modelCallsPerConversation: 60,
  toolCallsPerTurn: 3,
  toolCallsPerConversation: 20,
  recursion: 25,
} as const;

// The conversation's history is the record of what the model has done:
// each of its replies is one model call, and each tool call is listed on
// the reply that made it. Code-written replies don't count.
export function callsSoFar(messages: BaseMessage[]) {
  const fromModel = messages.filter(
    (message) => AIMessage.isInstance(message) && message.name !== BANK_AUTHOR,
  ) as AIMessage[];
  const toolCalls = fromModel.reduce((sum, message) => sum + (message.tool_calls?.length ?? 0), 0);
  return { modelCalls: fromModel.length, toolCalls };
}

// The per-turn limits, cut down to what the conversation has left. The
// agent's own thread limits would need its own checkpointer; the parent
// graph's checkpointed history serves instead.
export function turnLimits(messages: BaseMessage[]) {
  const used = callsSoFar(messages);
  return {
    modelCalls: Math.min(
      CALL_LIMITS.modelCallsPerTurn,
      CALL_LIMITS.modelCallsPerConversation - used.modelCalls,
    ),
    toolCalls: Math.min(
      CALL_LIMITS.toolCallsPerTurn,
      CALL_LIMITS.toolCallsPerConversation - used.toolCalls,
    ),
  };
}
