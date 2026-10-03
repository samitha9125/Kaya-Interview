import { MemorySaver } from "@langchain/langgraph";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage } from "langchain";
import { buildConversationGraph, runConfig, type ConversationGraph } from "@/server/agent/graph";

// The real graph with a scripted model and in-memory checkpoints.
export function buildTestGraph(loanModel: BaseChatModel): ConversationGraph {
  return buildConversationGraph({ loanModel, checkpointer: new MemorySaver() });
}

export function sendMessage(graph: ConversationGraph, threadId: string, text: string) {
  return graph.invoke({ messages: [new HumanMessage(text)] }, runConfig(threadId));
}

export async function pendingInterrupts(graph: ConversationGraph, threadId: string) {
  const snapshot = await graph.getState(runConfig(threadId));
  return snapshot.tasks.flatMap((task) => task.interrupts);
}
