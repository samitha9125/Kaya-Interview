import { Command, END } from "@langchain/langgraph";
import { AIMessage, HumanMessage, ToolMessage } from "langchain";
import type { SituationLabel } from "../labels";
import type { ConversationStateValue } from "../state";

type Update = Partial<ConversationStateValue>;

// Code-written replies carry this name, so they are told apart from the
// model's own replies when calls are counted (FR-AGT-11).
export const BANK_AUTHOR = "bank";

export function fromBank(text: string, id?: string): AIMessage {
  return new AIMessage({ id, content: text, name: BANK_AUTHOR });
}

// FR-AGT-08: the LLM learns what happened from a label on its own tool
// call, swapped in place by message ID; the customer sees the code-written
// template (FR-AGT-07). Only a call since the customer's latest message
// is this journey's; an ending reached without one leaves earlier labels
// as they were.
export function labelled(state: ConversationStateValue, label: SituationLabel): ToolMessage[] {
  const sinceCustomer = state.messages.slice(
    state.messages.findLastIndex((message) => HumanMessage.isInstance(message)) + 1,
  );
  const call = sinceCustomer.findLast((message) => ToolMessage.isInstance(message));
  if (!call || !ToolMessage.isInstance(call)) return [];
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
    update: { ...update, messages: [...labelled(state, label), fromBank(text)] },
  });
}
