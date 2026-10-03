import { Command } from "@langchain/langgraph";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, createAgent, tool, ToolMessage, type ToolRuntime } from "langchain";
import { z } from "zod";
import { LOAN_PROMPT } from "../prompts/loan";
import type { ConversationStateValue } from "../state";

export const REQUEST_ASSESSMENT = "request_assessment";

// The documented handoff: the tool hands control to a deterministic node in
// the parent graph, so the LLM can ask for an assessment but never run one.
// The AI message and its tool result travel together to keep the history
// valid for the next model call.
const requestAssessment = tool(
  (_input, runtime: ToolRuntime<ConversationStateValue>) => {
    const lastAiMessage = [...runtime.state.messages].reverse().find(AIMessage.isInstance);
    const result = new ToolMessage({
      content: "Assessment requested",
      tool_call_id: runtime.toolCallId,
    });
    return new Command({
      goto: "consent",
      graph: Command.PARENT,
      update: { messages: [lastAiMessage, result].filter(Boolean) },
    });
  },
  {
    name: REQUEST_ASSESSMENT,
    description: "Start a loan eligibility check for the signed-in customer.",
    schema: z.object({}),
  },
);

// A wrapper node calling agent.invoke is the documented way to place a
// createAgent specialist in a parent graph. It passes messages only.
export function createLoanAgentNode(model: BaseChatModel) {
  const agent = createAgent({ model, tools: [requestAssessment], systemPrompt: LOAN_PROMPT });
  return async (state: ConversationStateValue) => {
    const result = await agent.invoke({ messages: state.messages });
    return { messages: result.messages };
  };
}
