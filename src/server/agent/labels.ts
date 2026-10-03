import type { AssessResult, SubmitResult } from "@/server/modules/lending";

// FR-AGT-08: all the LLM ever learns about what the code did. Never an
// error, a reason code, a number or personal data.
export type SituationLabel =
  | "NEEDS_SIGN_IN"
  | "NEEDS_CONSENT"
  | "CHECK_UNAVAILABLE_TODAY"
  | "OUTCOME_SHOWN"
  | "REFERRED"
  | "INVALID_INPUT"
  | "SUBMITTED"
  | "HANDED_TO_PERSON";

type AssessFailure = Extract<AssessResult, { ok: false }>["reason"];
type SubmitFailure = Extract<SubmitResult, { ok: false }>["reason"];

// An existing application's status was shown; every other failure means no
// check could be made, whatever the internal reason (budget, block,
// cool-down, outage).
export function assessFailureLabel(reason: AssessFailure): SituationLabel {
  return reason === "open_application" ? "OUTCOME_SHOWN" : "CHECK_UNAVAILABLE_TODAY";
}

// An expired result or an open application was explained to the customer;
// anything else is a failure on our side.
export function submitFailureLabel(reason: SubmitFailure): SituationLabel {
  return reason === "expired" || reason === "open_application"
    ? "OUTCOME_SHOWN"
    : "CHECK_UNAVAILABLE_TODAY";
}
