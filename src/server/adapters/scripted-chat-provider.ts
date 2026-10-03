import { AIMessage, fakeModel, HumanMessage, type BaseMessage } from "langchain";
import type { ChatModelProvider } from "@/server/agent/ports";

// TD25: browser tests and keyless demos run the real graph with this
// stand-in for the loan agent's model. It plays the agent by rule: with
// an amount and a term in the customer's last message it asks for an
// assessment; otherwise it asks for them. Everything after that is code,
// so a journey behaves exactly as it would with a real model.
export const ASK_FOR_TERMS =
  "How much would you like to borrow, and over how many months? For example: 500,000 over 36 months.";
export const TERMS_REFUSED =
  "I can't check those terms. Please choose an amount and a term within our personal loan range.";

const AMOUNT_AND_TERM = /(\d[\d,]{3,})\D+?(\d{1,3})\s*months?/i;
// More than one turn's model calls (FR-AGT-11), so the agent's own limit
// is what stops a turn.
const REPLIES_PER_MODEL = 10;

function replyTo(messages: BaseMessage[], callId: () => string): BaseMessage {
  const last = messages.at(-1);
  if (!HumanMessage.isInstance(last)) return new AIMessage(TERMS_REFUSED);
  const match = AMOUNT_AND_TERM.exec(last.text);
  if (!match?.[1] || !match[2]) return new AIMessage(ASK_FOR_TERMS);
  const args = { amountLkr: Number(match[1].replaceAll(",", "")), termMonths: Number(match[2]) };
  return new AIMessage({
    content: "",
    tool_calls: [{ id: callId(), name: "request_assessment", args, type: "tool_call" }],
  });
}

export class ScriptedChatProvider implements ChatModelProvider {
  private calls = 0;

  chatModel() {
    const model = fakeModel();
    const callId = () => `scripted-call-${++this.calls}`;
    for (let reply = 0; reply < REPLIES_PER_MODEL; reply++) {
      model.respond((messages) => replyTo(messages, callId));
    }
    return model;
  }
}
