import { Command, END } from "@langchain/langgraph";
import { AIMessage } from "langchain";
import type { ConversationStateValue } from "../state";

type Update = Partial<ConversationStateValue>;

// Every ending is a code-written template (FR-AGT-07), shown as the
// assistant's reply.
export function endWith(text: string, update: Update = {}) {
  return new Command({ goto: END, update: { ...update, messages: [new AIMessage(text)] } });
}
