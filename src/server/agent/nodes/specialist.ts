import { GraphRecursionError, isGraphBubbleUp } from "@langchain/langgraph";
import {
  createAgent,
  modelCallLimitMiddleware,
  modelRetryMiddleware,
  piiMiddleware,
  toolCallLimitMiddleware,
  ToolCallLimitExceededError,
  type StructuredTool,
} from "langchain";
import type { AgentRole } from "@/server/modules/settings";
import { findNics } from "@/server/platform/pii";
import { logger } from "@/server/platform/logger";
import { contextOf, type NodeConfig } from "../context";
import { CALL_LIMITS, turnLimits } from "../limits";
import { situationLabels } from "../middleware/situation-labels";
import { modelRequestFor } from "../models";
import type { ChatModelProvider } from "../ports";
import type { ConversationStateValue } from "../state";
import { ASSISTANT_UNAVAILABLE, LIMIT_REACHED } from "../templates";
import { fromBank } from "./endings";

export type ModelRetryOptions = { initialDelayMs: number };

// One createAgent per role, each with its own tools and prompt.
export type Specialist = {
  role: Exclude<AgentRole, "triage">;
  tools: StructuredTool[];
  systemPrompt: string;
  // Shown to the LLM when its tool arguments are refused (FR-AGT-02).
  invalidInputHint: string;
};

// FR-AGT-09, FR-AGT-11, FR-AGT-12, in the order they wrap the model:
// NIC-shaped text is redacted from what goes in and what comes out (the
// harness already strips it from chat; this is defence in depth), a
// failing call is retried twice with backoff and jitter, and each turn is
// capped. A limit or a final failure throws, and the node answers with a
// template instead.
function middlewareFor(
  limits: ReturnType<typeof turnLimits>,
  retry: ModelRetryOptions,
  invalidInputHint: string,
) {
  return [
    situationLabels(invalidInputHint),
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
export function createSpecialistNode(
  specialist: Specialist,
  models: ChatModelProvider,
  retry: ModelRetryOptions,
) {
  return async (state: ConversationStateValue, config: NodeConfig) => {
    const { models: selection, correlationId } = contextOf(config);
    const limits = turnLimits(state.messages);
    if (limits.modelCalls <= 0 || limits.toolCalls <= 0) {
      return { messages: [fromBank(LIMIT_REACHED)] };
    }
    try {
      const agent = createAgent({
        model: models.chatModel(modelRequestFor(specialist.role, selection[specialist.role])),
        tools: specialist.tools,
        systemPrompt: specialist.systemPrompt,
        middleware: middlewareFor(limits, retry, specialist.invalidInputHint),
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
      logger.error(`${specialist.role} agent failed`, { correlationId, error });
      return { messages: [fromBank(ASSISTANT_UNAVAILABLE)] };
    }
  };
}
