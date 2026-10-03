import { Command, END } from "@langchain/langgraph";
import { AIMessage, ToolMessage } from "langchain";
import type { SituationLabel } from "../labels";
import type { ConversationStateValue } from "../state";

type Update = Partial<ConversationStateValue>;

// FR-AGT-08: the LLM learns what happened from a label on its own
// request_assessment call, swapped in place by message ID; the customer
// sees the code-written template (FR-AGT-07).
export function labelled(state: ConversationStateValue, label: SituationLabel): ToolMessage[] {
  const call = [...state.messages].reverse().find(ToolMessage.isInstance);
  if (!call) return [];
  return [new ToolMessage({ id: call.id, tool_call_id: call.tool_call_id, content: label })];
}

export function endWith(
  state: ConversationStateValue,
  label: SituationLabel,
  text: string,
  update: Update = {},
) {
  return new Command({
    goto: END,
    update: { ...update, messages: [...labelled(state, label), new AIMessage(text)] },
  });
}
