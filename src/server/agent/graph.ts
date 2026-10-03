import { END, START, StateGraph, type BaseCheckpointSaver } from "@langchain/langgraph";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { consentNode } from "./nodes/consent";
import { decideNode } from "./nodes/decide";
import { createLoanAgentNode } from "./nodes/loan-agent";
import { ConversationState } from "./state";

type GraphDeps = { loanModel: BaseChatModel; checkpointer: BaseCheckpointSaver };

export function buildConversationGraph({ loanModel, checkpointer }: GraphDeps) {
  return new StateGraph(ConversationState)
    .addNode("loan_agent", createLoanAgentNode(loanModel), { ends: ["consent"] })
    .addNode("consent", consentNode)
    .addNode("decide", decideNode)
    .addEdge(START, "loan_agent")
    .addEdge("loan_agent", END)
    .addEdge("consent", "decide")
    .addEdge("decide", END)
    .compile({ checkpointer });
}

export type ConversationGraph = ReturnType<typeof buildConversationGraph>;

// The default "async" durability can lose the last step in a crash.
export function runConfig(threadId: string) {
  return { configurable: { thread_id: threadId }, durability: "sync" as const };
}
