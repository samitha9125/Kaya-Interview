import { tool, type ToolRuntime } from "langchain";
import { LoanTerms, PRODUCT } from "@/server/modules/lending";
import type { ChatModelProvider } from "../ports";
import { LOAN_PROMPT } from "../prompts/loan";
import type { ConversationStateValue } from "../state";
import { createSpecialistNode, handOff, type ModelRetryOptions } from "./specialist";

export const REQUEST_ASSESSMENT = "request_assessment";

// The LLM can ask for an assessment but never run one. Its arguments are
// the loan terms only; who the customer is comes from the session
// (FR-AGT-04). Earlier journey fields are cleared, so a new request starts
// from the gate.
export const requestAssessment = tool(
  (terms: LoanTerms, runtime: ToolRuntime<ConversationStateValue>) =>
    handOff(runtime, "Assessment requested", "loan_gate", {
      loanTerms: { amountLkr: terms.amountLkr, termMonths: terms.termMonths },
      consentId: null,
      assessment: null,
      applicationId: null,
      decision: null,
    }),
  {
    name: REQUEST_ASSESSMENT,
    description:
      "Start a loan eligibility check for the signed-in customer, for the amount (LKR) and term (months) they asked about.",
    schema: LoanTerms,
  },
);

const INVALID_TERMS_HINT = `The amount must be a whole number of rupees from LKR ${PRODUCT.minAmountLkr.toLocaleString("en-US")} to LKR ${PRODUCT.maxAmountLkr.toLocaleString("en-US")}, and the term ${PRODUCT.minTermMonths} to ${PRODUCT.maxTermMonths} whole months.`;

// FR-AGT-02: the loan specialist collects the terms and asks for an
// assessment; everything after that is code.
export function createLoanAgentNode(models: ChatModelProvider, retry: ModelRetryOptions) {
  return createSpecialistNode(
    {
      role: "loan",
      tools: [requestAssessment],
      systemPrompt: LOAN_PROMPT,
      invalidInputHint: INVALID_TERMS_HINT,
    },
    models,
    retry,
  );
}
