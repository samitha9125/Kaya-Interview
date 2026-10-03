import { ToolInputParsingException } from "@langchain/core/tools";
import { isGraphBubbleUp } from "@langchain/langgraph";
import { createMiddleware, ToolInvocationError, ToolMessage } from "langchain";

// FR-AGT-02, FR-AGT-08 (P1-09): arguments the tool's schema refuses become
// INVALID_INPUT and a human hint. Without this, the agent's tool node
// answers the LLM with the parser's own message, arguments and all. Under
// middleware that failure arrives wrapped in a ToolInvocationError.
// LangGraph's control flow (a handoff, a pause) passes through untouched;
// any other error is a bug and is left to the harness.
export function situationLabels(invalidInputHint: string) {
  return createMiddleware({
    name: "SituationLabels",
    wrapToolCall: async (request, handler) => {
      try {
        return await handler(request);
      } catch (error) {
        if (isGraphBubbleUp(error) || !isInvalidInput(error)) throw error;
        return new ToolMessage({
          content: `INVALID_INPUT: ${invalidInputHint}`,
          tool_call_id: request.toolCall.id ?? "",
        });
      }
    },
  });
}

function isInvalidInput(error: unknown): boolean {
  return (
    ToolInvocationError.isInstance(error) && error.toolError instanceof ToolInputParsingException
  );
}
