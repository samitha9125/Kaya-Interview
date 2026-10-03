import { AIMessage } from "langchain";
import { LOAN_PROMPT } from "../prompts/loan";
import type { ConversationStateValue } from "../state";
import { CANT_SHARE, NO_DECISION_IN_CHAT } from "../templates";
import { fromBank } from "./endings";

type Outcome = "eligible" | "not_eligible" | "referred";

// FR-AGT-07's word list, mapped to the outcome each word claims. Whole
// words keep "eligibility check" usable; "not eligible" claims the
// opposite of "eligible".
const CLAIMS: [RegExp, Outcome][] = [
  [/\bnot eligible\b|\bineligible\b|\b(decline|declined|reject|rejected)\b/i, "not_eligible"],
  [/\b(approve|approved)\b|(?<!not )\beligible\b/i, "eligible"],
  [/\breferred\b/i, "referred"],
];

export function claimedOutcomes(text: string): Outcome[] {
  return CLAIMS.filter(([pattern]) => pattern.test(text)).map(([, outcome]) => outcome);
}

export function claimsDecision(text: string): boolean {
  return claimedOutcomes(text).length > 0;
}

// BR-LEND-11, P0-06: the model is never given a score, a band or its
// instructions, so a reply that talks about them is invented or leaked.
const SCORE_OR_BAND = /\b(credit )?score (is|of|was|=)\b|\bband [A-D]\b/i;
const PROMPT_LINES = LOAN_PROMPT.split("\n")
  .map((line) => line.replace(/^- /, "").trim())
  .filter((line) => line.length >= 30);

export function leaksSomething(text: string): boolean {
  return SCORE_OR_BAND.test(text) || PROMPT_LINES.some((line) => text.includes(line));
}

// FR-AGT-07, FR-AGT-10: replies are buffered, so this runs before anything
// reaches the browser. A claimed outcome must be the one in state (P0-05,
// P0-18): pressure can't turn "not eligible" into "approved". The
// replacement keeps the message ID, so the reducer swaps it in place and
// the next model call never sees the original.
export function validateReplyNode(state: ConversationStateValue) {
  const reply = state.messages.at(-1);
  if (!AIMessage.isInstance(reply)) return {};
  if (leaksSomething(reply.text)) return { messages: [fromBank(CANT_SHARE, reply.id)] };
  const contradicts = claimedOutcomes(reply.text).some((claim) => claim !== state.decision);
  if (!contradicts) return {};
  return { messages: [fromBank(NO_DECISION_IN_CHAT, reply.id)] };
}
