import { END, START, StateGraph, type BaseCheckpointSaver } from "@langchain/langgraph";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage } from "langchain";
import { consentNode } from "./nodes/consent";
import { decideNode } from "./nodes/decide";
import { createLoanAgentNode } from "./nodes/loan-agent";
import { validateReplyNode } from "./nodes/validate-reply";
import { ConversationState, type ConversationStateValue } from "./state";

type GraphDeps = { loanModel: BaseChatModel; checkpointer: BaseCheckpointSaver };

// A text reply goes to validation; a handoff has already set its own next
// node through Command.PARENT, so this edge adds nothing.
function routeAfterLoanAgent(state: ConversationStateValue) {
  const last = state.messages.at(-1);
  return AIMessage.isInstance(last) && !last.tool_calls?.length ? "validate_reply" : END;
}

export function buildConversationGraph({ loanModel, checkpointer }: GraphDeps) {
  return new StateGraph(ConversationState)
    .addNode("loan_agent", createLoanAgentNode(loanModel), { ends: ["consent"] })
    .addNode("validate_reply", validateReplyNode)
    .addNode("consent", consentNode)
    .addNode("decide", decideNode)
    .addEdge(START, "loan_agent")
    .addConditionalEdges("loan_agent", routeAfterLoanAgent, ["validate_reply", END])
    .addEdge("validate_reply", END)
    .addEdge("consent", "decide")
    .addEdge("decide", END)
    .compile({ checkpointer });
}

export type ConversationGraph = ReturnType<typeof buildConversationGraph>;

// The default "async" durability can lose the last step in a crash.
export function runConfig(threadId: string) {
  return { configurable: { thread_id: threadId }, durability: "sync" as const };
}
