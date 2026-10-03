import { Command } from "@langchain/langgraph";
import { AIMessage, createAgent, tool, ToolMessage, type ToolRuntime } from "langchain";
import { LoanTerms } from "@/server/modules/lending";
import { contextOf, type NodeConfig } from "../context";
import { modelRequestFor } from "../models";
import type { ChatModelProvider } from "../ports";
import { LOAN_PROMPT } from "../prompts/loan";
import type { ConversationStateValue } from "../state";

export const REQUEST_ASSESSMENT = "request_assessment";

// The documented handoff: the tool hands control to a deterministic node in
// the parent graph, so the LLM can ask for an assessment but never run one.
// Its arguments are the loan terms only; who the customer is comes from
// the session (FR-AGT-04). The AI message and its tool result travel
// together to keep the history valid for the next model call. Earlier
// journey fields are cleared, so a new request starts from the gate.
const requestAssessment = tool(
  (terms: LoanTerms, runtime: ToolRuntime<ConversationStateValue>) => {
    const lastAiMessage = [...runtime.state.messages].reverse().find(AIMessage.isInstance);
    const result = new ToolMessage({
      content: "Assessment requested",
      tool_call_id: runtime.toolCallId,
    });
    return new Command({
      goto: "loan_gate",
      graph: Command.PARENT,
      update: {
        messages: [lastAiMessage, result].filter(Boolean),
        loanTerms: { amountLkr: terms.amountLkr, termMonths: terms.termMonths },
        consentId: null,
        assessment: null,
        applicationId: null,
        decision: null,
      },
    });
  },
  {
    name: REQUEST_ASSESSMENT,
    description:
      "Start a loan eligibility check for the signed-in customer, for the amount (LKR) and term (months) they asked about.",
    schema: LoanTerms,
  },
);

// A wrapper node calling agent.invoke is the documented way to place a
// createAgent specialist in a parent graph. It passes messages only. The
// model is the one this conversation started with (FR-SET-01).
export function createLoanAgentNode(models: ChatModelProvider) {
  return async (state: ConversationStateValue, config: NodeConfig) => {
    const { models: selection } = contextOf(config);
    const model = models.chatModel(modelRequestFor("loan", selection.loan));
    const agent = createAgent({ model, tools: [requestAssessment], systemPrompt: LOAN_PROMPT });
    const result = await agent.invoke({ messages: state.messages });
    return { messages: result.messages };
  };
}
