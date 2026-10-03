import { AIMessage, type BaseMessage } from "langchain";
import { runConfig, type ConversationGraph } from "@/server/agent/graph";
import { findPendingPause } from "@/server/agent/resume";

// The assistant's replies from this turn (already validated, FR-AGT-10) and
// the card to show, if the graph is now waiting on one. Tool calls and
// their results are internal and never sent. The SSE transport (T15)
// sends the same content as events.
export async function turnResponse(
  graph: ConversationGraph,
  conversationId: string,
  messagesBefore: number,
): Promise<Response> {
  const { values } = await graph.getState(runConfig(conversationId));
  const messages: BaseMessage[] = values.messages ?? [];
  const replies = messages
    .slice(messagesBefore)
    .filter((message) => AIMessage.isInstance(message) && !message.tool_calls?.length)
    .map((message) => ({ id: message.id, text: message.text }));
  const pending = await findPendingPause(graph, conversationId);
  const pause = pending ? { interruptId: pending.interruptId, ...pending.pause } : null;
  return Response.json({ conversationId, messages: replies, pause });
}
