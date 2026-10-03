import { Command, interrupt } from "@langchain/langgraph";
import { z } from "zod";
import type { ConversationStateValue } from "../state";
import { CONFIRM_DECLINED, CONSENT_DECLINED } from "../templates";
import { endWith } from "./endings";

// FR-AGT-06, TD11: each pause resumes with a server-made reference, never
// what the customer typed. Strict, so a resume that also carries a password
// or an amount is refused. Declining is an answer too (TD14).
export const StepUpReference = z.strictObject({ verified: z.literal(true) });
export const ConsentReference = z.union([
  z.strictObject({ consentId: z.string().min(1) }),
  z.strictObject({ declined: z.literal(true) }),
]);
export const ConfirmReference = z.union([
  z.strictObject({ confirmed: z.literal(true) }),
  z.strictObject({ declined: z.literal(true) }),
]);

// FR-ONB-02: the server validated and stored the form; only its ID comes back.
export const KycFormReference = z.union([
  z.strictObject({ draftId: z.string().min(1) }),
  z.strictObject({ declined: z.literal(true) }),
]);

export type PauseKind = "step_up" | "consent" | "confirm" | "kyc_form" | "kyc_confirm";
export type Pause =
  | { kind: "step_up" }
  | { kind: "consent" | "confirm"; amountLkr: number; termMonths: number }
  | { kind: "kyc_form" }
  | { kind: "kyc_confirm"; draftId: string };

export const REFERENCE_SCHEMAS = {
  step_up: StepUpReference,
  consent: ConsentReference,
  confirm: ConfirmReference,
  kyc_form: KycFormReference,
  kyc_confirm: ConfirmReference,
} as const;

function termsOf(state: ConversationStateValue) {
  const terms = state.assessment ?? state.loanTerms;
  if (!terms) throw new Error("a loan pause was reached without loan terms");
  return { amountLkr: terms.amountLkr, termMonths: terms.termMonths };
}

// interrupt() comes first in every pause: on resume the node re-runs from
// the top, so anything before it would run twice. The step-up reference is
// only a signal; whether the step-up is fresh is checked by the next node
// against the session (BR-AUTH-03).
export function stepUpNode(next: "loan_gate" | "submit") {
  return () => {
    interrupt<Pause, z.infer<typeof StepUpReference>>(
      { kind: "step_up" },
      { responseSchema: StepUpReference },
    );
    return new Command({ goto: next });
  };
}

// The card shows the terms the consent is for; the route handler records
// consent for those same terms, read from this pause, not from the browser.
export function consentNode(state: ConversationStateValue) {
  const answer = interrupt<Pause, z.infer<typeof ConsentReference>>(
    { kind: "consent", ...termsOf(state) },
    { responseSchema: ConsentReference },
  );
  if ("declined" in answer) return endWith(state, "NEEDS_CONSENT", CONSENT_DECLINED);
  return new Command({ goto: "credit_check", update: { consentId: answer.consentId } });
}

// BR-LEND-10: the confirmation shows the assessed terms, and submit takes
// them from the assessment, so nothing the customer sends can change them.
export function confirmNode(state: ConversationStateValue) {
  const answer = interrupt<Pause, z.infer<typeof ConfirmReference>>(
    { kind: "confirm", ...termsOf(state) },
    { responseSchema: ConfirmReference },
  );
  if ("declined" in answer) return endWith(state, "OUTCOME_SHOWN", CONFIRM_DECLINED);
  return new Command({ goto: "submit" });
}
