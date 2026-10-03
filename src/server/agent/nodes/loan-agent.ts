import { Command, GraphRecursionError, isGraphBubbleUp } from "@langchain/langgraph";
import {
  AIMessage,
  createAgent,
  modelCallLimitMiddleware,
  modelRetryMiddleware,
  piiMiddleware,
  tool,
  toolCallLimitMiddleware,
  ToolCallLimitExceededError,
  ToolMessage,
  type ToolRuntime,
} from "langchain";
import { findNics } from "@/server/platform/pii";
import { logger } from "@/server/platform/logger";
import { CALL_LIMITS, turnLimits } from "../limits";
import { ASSISTANT_UNAVAILABLE, LIMIT_REACHED } from "../templates";
import { fromBank } from "./endings";
import { LoanTerms, PRODUCT } from "@/server/modules/lending";
import { situationLabels } from "../middleware/situation-labels";
import { contextOf, type NodeConfig } from "../context";
import { modelRequestFor } from "../models";
import type { ChatModelProvider } from "../ports";
import { LOAN_PROMPT } from "../prompts/loan";
import type { ConversationStateValue } from "../state";

export const REQUEST_ASSESSMENT = "request_assessment";

// The documented handoff: the tool hands control to a deterministic node in
// the parent graph, so the LLM can ask for an assessment but never run one.
// Its arguments are the loan terms only; who the customer is comes from
// the session (FR-AGT-04). The AI message and its tool result travel
// together to keep the history valid for the next model call. Earlier
// journey fields are cleared, so a new request starts from the gate.
export const requestAssessment = tool(
  (terms: LoanTerms, runtime: ToolRuntime<ConversationStateValue>) => {
    const lastAiMessage = [...runtime.state.messages].reverse().find(AIMessage.isInstance);
    const result = new ToolMessage({
      content: "Assessment requested",
      tool_call_id: runtime.toolCallId,
    });
    return new Command({
      goto: "loan_gate",
      graph: Command.PARENT,
      update: {
        messages: [lastAiMessage, result].filter(Boolean),
        loanTerms: { amountLkr: terms.amountLkr, termMonths: terms.termMonths },
        consentId: null,
        assessment: null,
        applicationId: null,
        decision: null,
      },
    });
  },
  {
    name: REQUEST_ASSESSMENT,
    description:
      "Start a loan eligibility check for the signed-in customer, for the amount (LKR) and term (months) they asked about.",
    schema: LoanTerms,
  },
);

const INVALID_TERMS_HINT = `The amount must be a whole number of rupees from LKR ${PRODUCT.minAmountLkr.toLocaleString("en-US")} to LKR ${PRODUCT.maxAmountLkr.toLocaleString("en-US")}, and the term ${PRODUCT.minTermMonths} to ${PRODUCT.maxTermMonths} whole months.`;

export type ModelRetryOptions = { initialDelayMs: number };

// FR-AGT-09, FR-AGT-11, FR-AGT-12, in the order they wrap the model:
// NIC-shaped text is redacted from what goes in and what comes out (the
// harness already strips it from chat; this is defence in depth), a
// failing call is retried twice with backoff and jitter, and each turn is
// capped. A limit or a final failure throws, and the node answers with a
// template instead.
function middlewareFor(limits: ReturnType<typeof turnLimits>, retry: ModelRetryOptions) {
  return [
    situationLabels(INVALID_TERMS_HINT),
    piiMiddleware("nic", {
      detector: findNics,
      strategy: "redact",
      applyToInput: true,
      applyToOutput: true,
    }),
    modelRetryMiddleware({
      maxRetries: 2,
      backoffFactor: 2,
      initialDelayMs: retry.initialDelayMs,
      jitter: true,
      onFailure: "error",
    }),
    modelCallLimitMiddleware({ runLimit: limits.modelCalls, exitBehavior: "error" }),
    toolCallLimitMiddleware({ runLimit: limits.toolCalls, exitBehavior: "error" }),
  ];
}

// The model-limit error class isn't exported, so it's recognised by name.
// Middleware may wrap an error, so the cause chain is followed.
function isLimitError(error: unknown): boolean {
  for (let current = error; current instanceof Error; current = current.cause) {
    if (current instanceof ToolCallLimitExceededError) return true;
    if (current instanceof GraphRecursionError) return true;
    if (current.name === "ModelCallLimitMiddlewareError") return true;
  }
  return false;
}

// A wrapper node calling agent.invoke is the documented way to place a
// createAgent specialist in a parent graph. It passes messages only. The
// model is the one this conversation started with (FR-SET-01).
export function createLoanAgentNode(models: ChatModelProvider, retry: ModelRetryOptions) {
  return async (state: ConversationStateValue, config: NodeConfig) => {
    const { models: selection, correlationId } = contextOf(config);
    const limits = turnLimits(state.messages);
    if (limits.modelCalls <= 0 || limits.toolCalls <= 0) {
      return { messages: [fromBank(LIMIT_REACHED)] };
    }
    try {
      const agent = createAgent({
        model: models.chatModel(modelRequestFor("loan", selection.loan)),
        tools: [requestAssessment],
        systemPrompt: LOAN_PROMPT,
        middleware: middlewareFor(limits, retry),
      });
      const result = await agent.invoke(
        { messages: state.messages },
        { recursionLimit: CALL_LIMITS.recursion },
      );
      return { messages: result.messages };
    } catch (error) {
      if (isGraphBubbleUp(error)) throw error;
      if (isLimitError(error)) return { messages: [fromBank(LIMIT_REACHED)] };
      // P1-06/07: a missing or refused key, a provider outage, a timeout.
      logger.error("loan agent failed", { correlationId, error });
      return { messages: [fromBank(ASSISTANT_UNAVAILABLE)] };
    }
  };
}
