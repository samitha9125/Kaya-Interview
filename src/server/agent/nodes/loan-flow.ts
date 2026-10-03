import { Command, type LangGraphRunnableConfig, type NodeError } from "@langchain/langgraph";
import {
  assessLoan,
  findOpenApplication,
  submitApplication,
  type LendingDeps,
} from "@/server/modules/lending";
import { isBusyError } from "@/server/platform/db";
import { logger } from "@/server/platform/logger";
import { ConversationContext, contextOf, type NodeConfig } from "../context";
import { reportProgress } from "../progress";
import type { ConversationStateValue } from "../state";
import {
  ASSESSMENT_EXPIRED,
  CANT_COMPLETE,
  CHECKING_CREDIT,
  CHECK_UNAVAILABLE_NOW,
  CHECK_UNAVAILABLE_TODAY,
  eligible,
  notEligible,
  openApplication,
  REFERRED_TO_OFFICER,
  submitted,
  NEEDS_SIGN_IN,
  SUBMITTING,
} from "../templates";
import { assessFailureLabel, submitFailureLabel } from "../labels";
import { AGENT_POLICY } from "../config";
import { endWith, fromBank, labelled } from "./endings";

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
    if (!customerId) return endWith(state, "NEEDS_SIGN_IN", NEEDS_SIGN_IN);
    const open = findOpenApplication(lending.db, customerId);
    if (open) return endWith(state, "APPLICATION_ALREADY_OPEN", openApplication(open.status));
    if (!isStepUpFresh(sessionId)) return new Command({ goto: "step_up_check" });
    return new Command({ goto: state.consentId ? "credit_check" : "consent" });
  };
}

// The step-up may have gone stale while the consent card was open, so it
// is checked again right before the score is used.
export function creditCheckNode({ lending, isStepUpFresh }: LoanFlowDeps) {
  return async (state: ConversationStateValue, config: NodeConfig) => {
    const context = contextOf(config);
    if (!context.customerId || !state.consentId) {
      return endWith(state, "CHECK_UNAVAILABLE", CANT_COMPLETE);
    }
    if (!isStepUpFresh(context.sessionId)) return new Command({ goto: "step_up_check" });
    reportProgress(config, CHECKING_CREDIT);
    const result = await assessLoan(
      { ...context, customerId: context.customerId, consentId: state.consentId },
      lending,
    );
    if (!result.ok) {
      const label = assessFailureLabel(result.reason);
      if (result.reason === "open_application") {
        return endWith(state, label, openApplication(result.status));
      }
      const shown =
        result.reason === "no_consent"
          ? CANT_COMPLETE
          : result.reason === "budget_exhausted"
            ? CHECK_UNAVAILABLE_TODAY
            : CHECK_UNAVAILABLE_NOW;
      return endWith(state, label, shown);
    }
    const { assessment } = result;
    const update = { assessment, decision: assessment.outcome };
    if (assessment.outcome === "referred") {
      return endWith(state, "REFERRED", REFERRED_TO_OFFICER, update);
    }
    if (assessment.outcome === "not_eligible" && assessment.ineligibleReason) {
      return endWith(state, "NOT_ELIGIBLE", notEligible(assessment.ineligibleReason), update);
    }
    return new Command({
      goto: "confirm",
      update: {
        ...update,
        messages: [...labelled(state, "ELIGIBLE"), fromBank(eligible(assessment))],
      },
    });
  };
}

// A busy database is worth one more try; the check itself is idempotent by
// consent (FR-PLAT-05). Anything else that escapes ends in the honest
// "unavailable" template, with the detail in the log only.
export const CREDIT_CHECK_POLICY = {
  retryPolicy: { maxAttempts: AGENT_POLICY.creditCheckAttempts, retryOn: isBusyError },
  timeout: { runTimeout: AGENT_POLICY.creditCheckTimeoutMs },
  errorHandler: (
    state: ConversationStateValue,
    error: NodeError,
    config?: LangGraphRunnableConfig,
  ) => {
    logger.error("credit check failed", {
      correlationId: ConversationContext.safeParse(config?.context).data?.correlationId,
      error: error.error,
    });
    return endWith(state, "CHECK_UNAVAILABLE", CHECK_UNAVAILABLE_NOW);
  },
};

// BR-LEND-10, BR-AUTH-03: a submission needs a step-up in the last five
// minutes; lending checks the rest. The assessment ID makes a replay safe.
export function submitNode({ lending, isStepUpFresh }: LoanFlowDeps) {
  return (state: ConversationStateValue, config: NodeConfig) => {
    const context = contextOf(config);
    const { assessment } = state;
    if (!context.customerId || !assessment) {
      return endWith(state, "CHECK_UNAVAILABLE", CANT_COMPLETE);
    }
    if (!isStepUpFresh(context.sessionId)) return new Command({ goto: "step_up_submit" });
    reportProgress(config, SUBMITTING);
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
    if (result.ok) {
      return endWith(state, "SUBMITTED", submitted(assessment), {
        applicationId: result.applicationId,
      });
    }
    const label = submitFailureLabel(result.reason);
    if (result.reason === "open_application") {
      return endWith(state, label, openApplication(result.status));
    }
    return endWith(state, label, result.reason === "expired" ? ASSESSMENT_EXPIRED : CANT_COMPLETE);
  };
}
