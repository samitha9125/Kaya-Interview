import { MessagesValue, StateSchema } from "@langchain/langgraph";
import { z } from "zod";

const Outcome = z.enum(["eligible", "not_eligible", "referred"]);

// What lending returned about the assessment: no score, band or
// confidence ever enters state (BR-LEND-11).
const AssessmentValue = z.object({
  assessmentId: z.string(),
  outcome: Outcome,
  ineligibleReason: z
    .enum(["credit_profile", "amount_above_limit", "repayment_too_high"])
    .nullable(),
  amountLkr: z.int(),
  termMonths: z.int(),
});
export type AssessmentValue = z.infer<typeof AssessmentValue>;

// Saved state holds references only: a consent ID, never consent text or
// a password (ARCHITECTURE §2). Loan fields are null between journeys; a
// new request clears them.
export const ConversationState = new StateSchema({
  messages: MessagesValue,
  loanTerms: z.object({ amountLkr: z.int(), termMonths: z.int() }).nullable().optional(),
  consentId: z.string().nullable().optional(),
  assessment: AssessmentValue.nullable().optional(),
  applicationId: z.string().nullable().optional(),
  decision: Outcome.nullable().optional(),
});

export type ConversationStateValue = typeof ConversationState.State;
