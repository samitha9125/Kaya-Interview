import { Command, type LangGraphRunnableConfig, type NodeError } from "@langchain/langgraph";
import { AIMessage } from "langchain";
import {
  assessLoan,
  findOpenApplication,
  submitApplication,
  type LendingDeps,
} from "@/server/modules/lending";
import { isBusyError } from "@/server/platform/db";
import { logger } from "@/server/platform/logger";
import { ConversationContext, contextOf, type NodeConfig } from "../context";
import type { ConversationStateValue } from "../state";
import {
  ASSESSMENT_EXPIRED,
  CANT_COMPLETE,
  CHECK_UNAVAILABLE_TODAY,
  eligible,
  notEligible,
  openApplication,
  REFERRED_TO_OFFICER,
  submitted,
  NEEDS_SIGN_IN,
} from "../templates";
import { endWith } from "./endings";

export type LoanFlowDeps = {
  lending: LendingDeps;
  // BR-AUTH-03: asked by session ID; the graph never holds a token.
  isStepUpFresh: (sessionId: string) => boolean;
};

// FR-AGT-05: the fixed order. Sign-in, then an open application, then a
// fresh step-up, then consent, then the check. Code decides each step;
// the LLM only asked for an assessment.
export function loanGateNode({ lending, isStepUpFresh }: LoanFlowDeps) {
  return (state: ConversationStateValue, config: NodeConfig) => {
    const { customerId, sessionId } = contextOf(config);
    if (!customerId) return endWith(NEEDS_SIGN_IN);
    const open = findOpenApplication(lending.db, customerId);
    if (open) return endWith(openApplication(open.status));
    if (!isStepUpFresh(sessionId)) return new Command({ goto: "step_up_check" });
    return new Command({ goto: state.consentId ? "credit_check" : "consent" });
  };
}

// The step-up may have gone stale while the consent card was open, so it
// is checked again right before the score is used.
export function creditCheckNode({ lending, isStepUpFresh }: LoanFlowDeps) {
  return async (state: ConversationStateValue, config: NodeConfig) => {
    const context = contextOf(config);
    if (!context.customerId || !state.consentId) return endWith(CANT_COMPLETE);
    if (!isStepUpFresh(context.sessionId)) return new Command({ goto: "step_up_check" });
    const result = await assessLoan(
      { ...context, customerId: context.customerId, consentId: state.consentId },
      lending,
    );
    if (!result.ok) {
      if (result.reason === "open_application") return endWith(openApplication(result.status));
      return endWith(result.reason === "no_consent" ? CANT_COMPLETE : CHECK_UNAVAILABLE_TODAY);
    }
    const { assessment } = result;
    const update = { assessment, decision: assessment.outcome };
    if (assessment.outcome === "referred") return endWith(REFERRED_TO_OFFICER, update);
    if (assessment.outcome === "not_eligible" && assessment.ineligibleReason) {
      return endWith(notEligible(assessment.ineligibleReason), update);
    }
    return new Command({
      goto: "confirm",
      update: { ...update, messages: [new AIMessage(eligible(assessment))] },
    });
  };
}

// A busy database is worth one more try; the check itself is idempotent by
// consent (FR-PLAT-05). Anything else that escapes ends in the honest
// "unavailable" template, with the detail in the log only.
export const CREDIT_CHECK_POLICY = {
  retryPolicy: { maxAttempts: 3, retryOn: isBusyError },
  // Two 5-second attempts and the 1-second pause between them fit easily.
  timeout: { runTimeout: 20_000 },
  errorHandler: (_state: unknown, error: NodeError, config?: LangGraphRunnableConfig) => {
    logger.error("credit check failed", {
      correlationId: ConversationContext.safeParse(config?.context).data?.correlationId,
      error: error.error,
    });
    return endWith(CHECK_UNAVAILABLE_TODAY);
  },
};

// BR-LEND-10, BR-AUTH-03: a submission needs a step-up in the last five
// minutes; lending checks the rest. The assessment ID makes a replay safe.
export function submitNode({ lending, isStepUpFresh }: LoanFlowDeps) {
  return (state: ConversationStateValue, config: NodeConfig) => {
    const context = contextOf(config);
    const { assessment } = state;
    if (!context.customerId || !assessment) return endWith(CANT_COMPLETE);
    if (!isStepUpFresh(context.sessionId)) return new Command({ goto: "step_up_submit" });
    const result = submitApplication(
      {
        ...context,
        customerId: context.customerId,
        assessmentId: assessment.assessmentId,
        amountLkr: assessment.amountLkr,
        termMonths: assessment.termMonths,
      },
      lending,
    );
    if (result.ok) return endWith(submitted(assessment), { applicationId: result.applicationId });
    if (result.reason === "open_application") return endWith(openApplication(result.status));
    return endWith(result.reason === "expired" ? ASSESSMENT_EXPIRED : CANT_COMPLETE);
  };
}
