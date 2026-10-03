import type { AssessResult, SubmitResult } from "@/server/modules/lending";

// FR-AGT-08: all the LLM ever learns about what the code did. Never an
// error, a reason code, a number or personal data. One label per ending
// the customer was shown, so a follow-up ("really?") can be answered
// consistently with it instead of guessed at.
export type SituationLabel =
  | "NEEDS_SIGN_IN"
  | "NEEDS_CONSENT"
  | "CHECK_UNAVAILABLE"
  | "ELIGIBLE"
  | "NOT_ELIGIBLE"
  | "APPLICATION_ALREADY_OPEN"
  | "RESULT_EXPIRED"
  | "APPLICATION_NOT_SENT"
  | "REFERRED"
  | "INVALID_INPUT"
  | "SUBMITTED"
  | "FORM_NOT_SENT"
  | "HANDED_TO_PERSON"
  | "CALLBACK_NOT_REQUESTED";

type AssessFailure = Extract<AssessResult, { ok: false }>["reason"];
type SubmitFailure = Extract<SubmitResult, { ok: false }>["reason"];

// An existing application was pointed out; every other failure means no
// check could be made, whatever the internal reason (budget, block,
// cool-down, outage).
export function assessFailureLabel(reason: AssessFailure): SituationLabel {
  return reason === "open_application" ? "APPLICATION_ALREADY_OPEN" : "CHECK_UNAVAILABLE";
}

// An expired result or an open application was explained to the customer;
// anything else is a failure on our side.
export function submitFailureLabel(reason: SubmitFailure): SituationLabel {
  if (reason === "expired") return "RESULT_EXPIRED";
  return reason === "open_application" ? "APPLICATION_ALREADY_OPEN" : "CHECK_UNAVAILABLE";
}
