import { AIMessage } from "langchain";
import { KYC_PROMPT } from "../prompts/kyc";
import { LOAN_PROMPT } from "../prompts/loan";
import { TONE_GUIDE } from "../prompts/tone";
import type { ConversationStateValue } from "../state";
import { CANT_COMPLETE, CANT_SHARE, NO_DECISION_IN_CHAT } from "../templates";
import { fromBank } from "./endings";

type Outcome = "eligible" | "not_eligible" | "referred";

// FR-AGT-07's word list, mapped to the outcome each word claims. Whole
// words keep "eligibility check" usable; "not eligible" claims the
// opposite of "eligible". A word list is best-effort (SPEC P0-05): it
// catches the usual ways of saying an outcome, not every paraphrase.
// "Qualify", "granted" and "sanctioned" count only as statements, so
// "I can check whether you qualify" stays usable.
const CONDITIONAL = String.raw`(?<!\b(?:if|whether|once|when|until)\b[^.?!]{0,40})`;
const CLAIMS: [RegExp, Outcome][] = [
  [
    /\bnot eligible\b|\bineligible\b|\b(decline|declined|reject|rejected)\b|(?:\bnot|n't) qualif(?:y|ied)\b|\bdisqualified\b|\bnot (?:been )?(?:granted|sanctioned)\b/i,
    "not_eligible",
  ],
  [
    new RegExp(
      String.raw`\b(approve|approved)\b|(?<!not )\beligible\b|${CONDITIONAL}(?:\byou(?: have|'ve)? qualif(?:y|ied)\b|\bqualifies\b|(?<!\bnot )\b(?:is|are|was|has been|have been|been) (?:granted|sanctioned)\b)`,
      "i",
    ),
    "eligible",
  ],
  [/\breferred\b/i, "referred"],
];

export function claimedOutcomes(text: string): Outcome[] {
  return CLAIMS.filter(([pattern]) => pattern.test(text)).map(([, outcome]) => outcome);
}

// BR-LEND-11, P0-06: the model is never given a score, a band or its
// instructions, so a reply that talks about them is invented or leaked.
const SCORE_OR_BAND = /\b(credit )?score (is|of|was|=)\b|\bband [A-D]\b/i;
const linesOf = (prompt: string) =>
  prompt
    .split("\n")
    .map((line) => line.replace(/^- /, "").trim())
    .filter((line) => line.length >= 30);
// The shared tone guide is left out, so each role's own instructions are
// what a leak is matched on.
const TONE_LINES = new Set(linesOf(TONE_GUIDE));
const PROMPT_LINES = [LOAN_PROMPT, KYC_PROMPT]
  .flatMap(linesOf)
  .filter((line) => !TONE_LINES.has(line));

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
  // A reasoning model can spend its whole output budget thinking and return
  // no text; the customer gets an honest retry message, never a blank reply.
  if (!reply.text.trim()) return { messages: [fromBank(CANT_COMPLETE, reply.id)] };
  if (leaksSomething(reply.text)) return { messages: [fromBank(CANT_SHARE, reply.id)] };
  const contradicts = claimedOutcomes(reply.text).some((claim) => claim !== state.decision);
  if (contradicts) return { messages: [fromBank(NO_DECISION_IN_CHAT, reply.id)] };
  const plain = plainTypography(reply.text);
  if (plain === reply.text) return {};
  return { messages: [new AIMessage({ id: reply.id, content: plain })] };
}

// FR-AGT-16: the tone guide asks for no dashes and straight quotes, but a
// prompt can't promise it, so model text is normalised here. Templates
// never pass through this node.
export function plainTypography(text: string): string {
  return text
    .replace(/(\d)–(\d)/g, "$1 to $2")
    .replace(/^[ \t]*[–—][ \t]*/gm, "")
    .replace(/\s*[–—]\s*/g, ", ")
    .replace(/,\s*([,.;:!?])/g, "$1")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"');
}
