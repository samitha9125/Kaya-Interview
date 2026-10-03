import { AIMessage } from "langchain";
import type { ConversationStateValue } from "../state";
import { NO_DECISION_IN_CHAT } from "../templates";

// FR-AGT-07's word list. Matching whole words keeps "eligibility check"
// usable while still catching "you're eligible" or "approved".
const DECISION_WORDING =
  /\b(approve|approved|eligible|decline|declined|reject|rejected|referred)\b/i;

export function claimsDecision(text: string): boolean {
  return DECISION_WORDING.test(text);
}

// Replies are buffered, so this runs before anything reaches the browser.
// The replacement keeps the message ID, so the reducer swaps it in place
// and the next model call never sees the invented outcome.
export function validateReplyNode(state: ConversationStateValue) {
  const reply = state.messages.at(-1);
  if (!AIMessage.isInstance(reply) || state.decision !== undefined) return {};
  if (!claimsDecision(reply.text)) return {};
  return { messages: [new AIMessage({ id: reply.id, content: NO_DECISION_IN_CHAT })] };
}
