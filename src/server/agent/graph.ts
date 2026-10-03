import { END, START, StateGraph, type BaseCheckpointSaver } from "@langchain/langgraph";
import { AIMessage } from "langchain";
import { ConversationContext, type ConversationContextValue } from "./context";
import { CALL_LIMITS } from "./limits";
import { createLoanAgentNode } from "./nodes/loan-agent";
import type { ModelRetryOptions } from "./nodes/specialist";
import {
  CREDIT_CHECK_POLICY,
  creditCheckNode,
  loanGateNode,
  submitNode,
  type LoanFlowDeps,
} from "./nodes/loan-flow";
import { confirmNode, consentNode, stepUpNode } from "./nodes/pauses";
import { validateReplyNode } from "./nodes/validate-reply";
import type { ChatModelProvider } from "./ports";
import { ConversationState, type ConversationStateValue } from "./state";

export type GraphDeps = LoanFlowDeps & {
  models: ChatModelProvider;
  checkpointer: BaseCheckpointSaver;
  modelRetry?: ModelRetryOptions;
};

// FR-AGT-12: about 1 s, then 2 s, before giving up.
const MODEL_RETRY: ModelRetryOptions = { initialDelayMs: 1_000 };

// A text reply goes to validation; a handoff has already set its own next
// node through Command.PARENT, so this edge adds nothing.
function routeAfterLoanAgent(state: ConversationStateValue) {
  const last = state.messages.at(-1);
  return AIMessage.isInstance(last) && !last.tool_calls?.length ? "validate_reply" : END;
}

// ARCHITECTURE §7. Only loan_agent is an LLM; every other node is code,
// and each routes itself with a Command.
export function buildConversationGraph(deps: GraphDeps) {
  return new StateGraph(ConversationState, ConversationContext)
    .addNode("loan_agent", createLoanAgentNode(deps.models, deps.modelRetry ?? MODEL_RETRY), {
      ends: ["loan_gate"],
    })
    .addNode("validate_reply", validateReplyNode)
    .addNode("loan_gate", loanGateNode(deps), {
      ends: ["step_up_check", "consent", "credit_check", END],
    })
    .addNode("step_up_check", stepUpNode("loan_gate"), { ends: ["loan_gate"] })
    .addNode("consent", consentNode, { ends: ["credit_check", END] })
    .addNode("credit_check", creditCheckNode(deps), {
      ends: ["step_up_check", "confirm", END],
      ...CREDIT_CHECK_POLICY,
    })
    .addNode("confirm", confirmNode, { ends: ["submit", END] })
    .addNode("step_up_submit", stepUpNode("submit"), { ends: ["submit"] })
    .addNode("submit", submitNode(deps), { ends: ["step_up_submit", END] })
    .addEdge(START, "loan_agent")
    .addConditionalEdges("loan_agent", routeAfterLoanAgent, ["validate_reply", END])
    .addEdge("validate_reply", END)
    .compile({ checkpointer: deps.checkpointer });
}

export type ConversationGraph = ReturnType<typeof buildConversationGraph>;

// The default "async" durability can lose the last step in a crash. The
// context is passed on every run, resumes included; it is never saved.
export function runConfig(threadId: string, context?: ConversationContextValue) {
  return {
    configurable: { thread_id: threadId },
    context,
    durability: "sync" as const,
    recursionLimit: CALL_LIMITS.recursion,
  };
}
