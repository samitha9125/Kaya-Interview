import { AIMessage, HumanMessage, type BaseMessage } from "langchain";
import { runConfig, type ConversationGraph } from "./graph";
import { findPendingPause, type PendingPause } from "./resume";

export type TranscriptMessage = { id: string; role: "customer" | "assistant"; text: string };
export type Transcript = { messages: TranscriptMessage[]; pause: PendingPause | null };

function toTranscript(message: BaseMessage, index: number): TranscriptMessage[] {
  const id = message.id ?? String(index);
  if (HumanMessage.isInstance(message)) return [{ id, role: "customer", text: message.text }];
  if (AIMessage.isInstance(message) && !message.tool_calls?.length) {
    return [{ id, role: "assistant", text: message.text }];
  }
  return [];
}

// What the customer may see of a conversation, from message `from` on:
// their own messages and the assistant's validated replies. Tool calls and
// their results are internal. A model reply still waiting for
// validate_reply (a turn cut off between the two) is left out, so no
// unvalidated text is ever shown (FR-AGT-10).
export async function readTranscript(
  graph: ConversationGraph,
  threadId: string,
  from = 0,
): Promise<Transcript> {
  const snapshot = await graph.getState(runConfig(threadId));
  const all: BaseMessage[] = snapshot.values.messages ?? [];
  const shown = snapshot.next.includes("validate_reply") ? all.slice(0, -1) : all;
  return {
    messages: shown.slice(from).flatMap((message, index) => toTranscript(message, from + index)),
    pause: (await findPendingPause(graph, threadId)) ?? null,
  };
}
