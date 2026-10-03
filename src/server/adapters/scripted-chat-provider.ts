import { AIMessage, fakeModel, HumanMessage, SystemMessage, type BaseMessage } from "langchain";
import type { ChatModelProvider } from "@/server/agent/ports";

// TD25: browser tests and keyless demos run the real graph with this
// stand-in for the specialists' model. It plays them by rule. As the loan
// agent: with an amount and a term in the customer's last message it asks
// for an assessment; otherwise it asks for them. As the KYC agent (its
// prompt names start_account_opening): it opens the form. As triage, it
// answers "other", so tests choose journeys with the starter buttons.
// Everything after that is code, so a journey behaves as it would with a
// real model.
export const ASK_FOR_TERMS =
  "How much would you like to borrow, and over how many months? For example: 500,000 over 36 months.";
export const TERMS_REFUSED =
  "I can't check those terms. Please choose an amount and a term within our personal loan range.";

const AMOUNT_AND_TERM = /(\d[\d,]{3,})\D+?(\d{1,3})\s*months?/i;
// More than one turn's model calls (FR-AGT-11), so the agent's own limit
// is what stops a turn.
const REPLIES_PER_MODEL = 10;

function toolCall(name: string, args: Record<string, unknown>, callId: () => string) {
  return new AIMessage({
    content: "",
    tool_calls: [{ id: callId(), name, args, type: "tool_call" }],
  });
}

function replyTo(messages: BaseMessage[], callId: () => string): BaseMessage {
  const last = messages.at(-1);
  if (!HumanMessage.isInstance(last)) return new AIMessage(TERMS_REFUSED);
  const prompt = messages.find(SystemMessage.isInstance)?.text ?? "";
  if (prompt.includes("start_account_opening")) {
    return toolCall("start_account_opening", {}, callId);
  }
  const match = AMOUNT_AND_TERM.exec(last.text);
  if (!match?.[1] || !match[2]) return new AIMessage(ASK_FOR_TERMS);
  const args = { amountLkr: Number(match[1].replaceAll(",", "")), termMonths: Number(match[2]) };
  return toolCall("request_assessment", args, callId);
}

export class ScriptedChatProvider implements ChatModelProvider {
  private calls = 0;

  chatModel() {
    const model = fakeModel().structuredResponse({ route: "other" });
    const callId = () => `scripted-call-${++this.calls}`;
    for (let reply = 0; reply < REPLIES_PER_MODEL; reply++) {
      model.respond((messages) => replyTo(messages, callId));
    }
    return model;
  }
}
