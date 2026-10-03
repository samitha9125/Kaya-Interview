import { END, START, StateGraph, type BaseCheckpointSaver } from "@langchain/langgraph";
import { AIMessage } from "langchain";
import { ConversationContext, type ConversationContextValue } from "./context";
import { CALL_LIMITS } from "./limits";
import type { RecordAudit } from "./middleware/audit-trail";
import type { OnboardingDeps } from "@/server/modules/onboarding";
import type { CallbackDeps } from "./callbacks/requests";
import { callbackFormNode, callbackNode } from "./nodes/callback";
import { createKycAgentNode } from "./nodes/kyc-agent";
import { kycConfirmNode, kycFormNode, kycSubmitNode } from "./nodes/kyc-flow";
import { createLoanAgentNode } from "./nodes/loan-agent";
import type { ModelRetryOptions } from "./nodes/specialist";
import {
  CREDIT_CHECK_POLICY,
  creditCheckNode,
  loanGateNode,
  submitNode,
  type LoanFlowDeps,
} from "./nodes/loan-flow";
import { confirmNode, consentNode, stepUpNode } from "./nodes/pauses";
import { createTriageNode } from "./nodes/triage";
import { validateReplyNode } from "./nodes/validate-reply";
import type { ChatModelProvider } from "./ports";
import { ConversationState, type ConversationStateValue } from "./state";

export type GraphDeps = LoanFlowDeps & {
  onboarding: OnboardingDeps;
  callbacks: CallbackDeps;
  models: ChatModelProvider;
  checkpointer: BaseCheckpointSaver;
  modelRetry?: ModelRetryOptions;
};

// FR-AGT-12: about 1 s, then 2 s, before giving up.
const MODEL_RETRY: ModelRetryOptions = { initialDelayMs: 1_000 };

// FR-AGT-01: sticky routing. A journey (set by triage or a starter button)
// goes straight to its specialist; only a conversation without one meets
// triage.
const JOURNEY_START = { loan: "loan_agent", kyc: "kyc_agent", human: "callback" } as const;

function routeFromStart(state: ConversationStateValue) {
  return state.journey ? JOURNEY_START[state.journey] : "triage";
}

// A text reply goes to validation; a handoff has already set its own next
// node through Command.PARENT, so this edge adds nothing.
function routeAfterSpecialist(state: ConversationStateValue) {
  const last = state.messages.at(-1);
  return AIMessage.isInstance(last) && !last.tool_calls?.length ? "validate_reply" : END;
}

// ARCHITECTURE §7. Triage and the specialists are LLMs; every other node is
// code, and each routes itself with a Command.
export function buildConversationGraph(deps: GraphDeps) {
  const { db, audit } = deps.lending;
  const record: RecordAudit = (event) => audit.record(db, event);
  const retry = deps.modelRetry ?? MODEL_RETRY;
  return new StateGraph(ConversationState, ConversationContext)
    .addNode("triage", createTriageNode(deps.models, record), {
      ends: ["loan_agent", "kyc_agent", "callback", END],
    })
    .addNode("loan_agent", createLoanAgentNode(deps.models, retry, record), {
      ends: ["loan_gate", "triage"],
    })
    .addNode("kyc_agent", createKycAgentNode(deps.models, retry, record), {
      ends: ["kyc_form", "triage"],
    })
    .addNode("validate_reply", validateReplyNode)
    .addNode("loan_gate", loanGateNode(deps), {
      ends: ["step_up_check", "consent", "credit_check", END],
    })
    .addNode("step_up_check", stepUpNode("loan_gate"), { ends: ["loan_gate"] })
    .addNode("consent", consentNode, { ends: ["credit_check", END] })
    .addNode("credit_check", creditCheckNode(deps), {
      ends: ["step_up_check", "confirm", END],
      ...CREDIT_CHECK_POLICY,
    })
    .addNode("confirm", confirmNode, { ends: ["submit", END] })
    .addNode("step_up_submit", stepUpNode("submit"), { ends: ["submit"] })
    .addNode("submit", submitNode(deps), { ends: ["step_up_submit", END] })
    .addNode("kyc_form", kycFormNode, { ends: ["kyc_confirm", END] })
    .addNode("kyc_confirm", kycConfirmNode, { ends: ["kyc_submit", END] })
    .addNode("kyc_submit", kycSubmitNode(deps.onboarding), { ends: [END] })
    .addNode("callback", callbackNode(deps.callbacks), { ends: ["callback_form", END] })
    .addNode("callback_form", callbackFormNode, { ends: [END] })
    .addConditionalEdges(START, routeFromStart, ["triage", "loan_agent", "kyc_agent", "callback"])
    .addConditionalEdges("loan_agent", routeAfterSpecialist, ["validate_reply", END])
    .addConditionalEdges("kyc_agent", routeAfterSpecialist, ["validate_reply", END])
    .addEdge("validate_reply", END)
    .compile({ checkpointer: deps.checkpointer });
}

export type ConversationGraph = ReturnType<typeof buildConversationGraph>;

// The default "async" durability can lose the last step in a crash. The
// context is passed on every run, resumes included; it is never saved.
export function runConfig(threadId: string, context?: ConversationContextValue) {
  return {
    configurable: { thread_id: threadId },
    context,
    durability: "sync" as const,
    recursionLimit: CALL_LIMITS.recursion,
  };
}
