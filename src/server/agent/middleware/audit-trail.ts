import { isGraphBubbleUp } from "@langchain/langgraph";
import { AIMessage, createMiddleware, ToolMessage } from "langchain";
import type { AuditEvent } from "@/server/platform/audit";

export type RecordAudit = (event: AuditEvent) => void;

export type ReplySource = {
  role: string;
  model: string;
  promptVersion: string;
  correlationId: string;
  conversationId: string;
};

// A handoff hands the step to the bank's code, whose own events (consent,
// loan.assessed, …) record what happened next.
const HANDED_OFF = "HANDED_OFF";

// ARCHITECTURE §12: every model reply and tool call is audited with the
// model and prompt version behind it. Names and labels only, never the
// text or the arguments, so nothing personal is copied into the trail.
export function auditTrail(record: RecordAudit, source: ReplySource) {
  const { role, model, promptVersion, correlationId, conversationId } = source;
  const base = { correlationId, conversationId, actor: `agent:${role}` };
  return createMiddleware({
    name: "AuditTrail",
    afterModel: (state) => {
      const reply = state.messages.at(-1);
      const toolCalls = AIMessage.isInstance(reply)
        ? (reply.tool_calls ?? []).map((call) => call.name)
        : [];
      record({ ...base, type: "agent.reply", model, promptVersion, payload: { role, toolCalls } });
    },
    wrapToolCall: async (request, handler) => {
      const tool = request.toolCall.name;
      const toolCall = (label: string) =>
        record({ ...base, type: "agent.tool_call", payload: { role, tool, label } });
      try {
        const result = await handler(request);
        toolCall(ToolMessage.isInstance(result) ? labelOf(result) : HANDED_OFF);
        return result;
      } catch (error) {
        if (isGraphBubbleUp(error)) toolCall(HANDED_OFF);
        throw error;
      }
    },
  });
}

// A situation label is the result's first word ("INVALID_INPUT: hint").
function labelOf(result: ToolMessage): string {
  return result.text.split(":")[0]?.trim() ?? "";
}
