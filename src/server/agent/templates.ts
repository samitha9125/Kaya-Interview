import type { ApplicationStatus, IneligibleReason } from "@/server/modules/lending";

// Customer-facing critical text is written by code, never by the LLM
// (FR-AGT-07). Not-eligible replies carry no numbers (BR-LEND-03).
export const NO_DECISION_IN_CHAT =
  "I can't give a decision in chat. I can run a proper eligibility check for you. Shall I start?";

export const REFERRED_TO_OFFICER =
  "Thanks, this one needs a quick look from one of our loan officers. They'll contact you within 1 business day.";

export const NEEDS_SIGN_IN =
  "To check a loan, please sign in first. If you're new to the bank, I can help you open an account instead.";

export const CONSENT_DECLINED =
  "No problem, I haven't checked anything. If you change your mind, just ask me to check a loan again.";

export const CHECK_UNAVAILABLE_TODAY =
  "I can't run the credit check right now. Please try again tomorrow, or I can arrange a call from our team.";

export const CONFIRM_DECLINED =
  "Okay, I haven't submitted anything. You can ask me to check a loan again at any time.";

export const ASSESSMENT_EXPIRED =
  "That result has expired, so I can't submit it. Ask me to check a loan again and I'll run a fresh check.";

// FR-AGT-12, P1-06/07: the model or its provider failed after retries.
export const ASSISTANT_UNAVAILABLE =
  "Sorry, the assistant is unavailable right now. Please try again in a little while, or contact your branch and our team will help.";

// FR-AGT-11, P1-10: a call limit was reached.
export const LIMIT_REACHED =
  "Sorry, I can't take this conversation any further myself. I can arrange a call from our team, or you can contact your branch.";

// P0-06: a reply that touched scores, bands or the assistant's instructions.
export const CANT_SHARE =
  "I can't share that. I can help you check a loan, or arrange a call from our team.";

export const CANT_COMPLETE =
  "Something went wrong on our side and I couldn't finish this. Please try again, or I can arrange a call from our team.";

// B3, A6: the assistant never opens an account; the branch completes it.
export const KYC_SUBMITTED =
  "Thanks, your account application is in. To finish opening your account, please visit any of our branches with your original NIC.";

export const KYC_FORM_CANCELLED =
  "No problem, nothing has been saved. If you'd like to open an account later, just ask.";

export const KYC_NOT_SENT =
  "Okay, I haven't sent your application. You can start again whenever you're ready.";

// FR-WEB-04: shown while code works on a step that can take a moment.
export const CHECKING_CREDIT = "Checking your credit record…";
export const SUBMITTING = "Submitting your application…";

const NOT_ELIGIBLE_REASON: Record<IneligibleReason, string> = {
  credit_profile: "based on your credit record, we can't offer this loan right now.",
  amount_above_limit: "this amount is more than we can offer you right now.",
  repayment_too_high: "the monthly repayments would be too high compared with your income.",
};

export function notEligible(reason: IneligibleReason): string {
  return `I'm sorry, ${NOT_ELIGIBLE_REASON[reason]} If you'd like to talk it through, I can arrange a call from our team.`;
}

export function openApplication(status: ApplicationStatus): string {
  return status === "approved"
    ? "You already have an approved loan application with us. Our team will be in touch about the next steps."
    : "You already have a loan application with one of our loan officers. They'll contact you within 1 business day.";
}

const lkr = (amount: number) => `LKR ${amount.toLocaleString("en-US")}`;

export function eligible(terms: { amountLkr: number; termMonths: number }): string {
  return `Good news: you're eligible for ${lkr(terms.amountLkr)} over ${terms.termMonths} months. Please confirm below to submit your application.`;
}

export function submitted(terms: { amountLkr: number; termMonths: number }): string {
  return `Your application for ${lkr(terms.amountLkr)} over ${terms.termMonths} months is approved. Our team will contact you about the next steps.`;
}
