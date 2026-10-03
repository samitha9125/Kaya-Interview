import { Command, MemorySaver, type BaseCheckpointSaver } from "@langchain/langgraph";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage } from "langchain";
import type { ConversationContextValue } from "@/server/agent/context";
import { buildConversationGraph, runConfig, type ConversationGraph } from "@/server/agent/graph";
import type { ChatModelProvider } from "@/server/agent/ports";
import { prepareResume } from "@/server/agent/resume";
import { recordConsent, type LendingDeps } from "@/server/modules/lending";
import { DEFAULT_MODELS } from "@/server/modules/settings";
import { scriptedBureau } from "@/test/fake-bureau";
import { CONTEXT, lendingTestSetup, TERMS } from "@/test/lending-setup";

export type TestGraphOptions = {
  lending?: LendingDeps;
  isStepUpFresh?: (sessionId: string) => boolean;
  checkpointer?: BaseCheckpointSaver;
  models?: ChatModelProvider;
};

// The real graph with a scripted model, in-memory checkpoints and real
// lending on in-memory SQLite. The step-up check is auth's, so a test
// decides it; everything else runs for real.
export function buildTestGraph(loanModel: BaseChatModel, options: TestGraphOptions = {}) {
  return buildConversationGraph({
    models: options.models ?? { chatModel: () => loanModel },
    lending: options.lending ?? lendingTestSetup(scriptedBureau([]).bureau).deps,
    isStepUpFresh: options.isStepUpFresh ?? (() => true),
    checkpointer: options.checkpointer ?? new MemorySaver(),
    // Retries without real waiting (TESTING_STANDARDS §5).
    modelRetry: { initialDelayMs: 0 },
  });
}

export function testContext(
  threadId: string,
  overrides: Partial<ConversationContextValue> = {},
): ConversationContextValue {
  return {
    customerId: CONTEXT.customerId,
    sessionId: "session-1",
    conversationId: threadId,
    correlationId: CONTEXT.correlationId,
    models: DEFAULT_MODELS,
    ...overrides,
  };
}

export function sendMessage(
  graph: ConversationGraph,
  threadId: string,
  text: string,
  context = testContext(threadId),
) {
  return graph.invoke({ messages: [new HumanMessage(text)] }, runConfig(threadId, context));
}

export async function resume(
  graph: ConversationGraph,
  threadId: string,
  interruptId: string,
  reference: unknown,
  context = testContext(threadId),
) {
  const prepared = await prepareResume(graph, { threadId, interruptId, reference });
  if (prepared.ok) {
    await graph.invoke(new Command({ resume: prepared.resume }), runConfig(threadId, context));
  }
  return prepared;
}

export async function pendingInterrupts(graph: ConversationGraph, threadId: string) {
  const snapshot = await graph.getState(runConfig(threadId));
  return snapshot.tasks.flatMap((task) => task.interrupts);
}

// The model asks for an assessment at once: the adversarial case, before
// any sign-in, step-up or consent (TESTING_STANDARDS §7).
export const ASSESSMENT_CALL = { name: "request_assessment", args: TERMS, id: "call-1" };

// What the consent route records when the customer agrees: a real consent
// row, whose ID is the only thing the graph receives.
export function consentFor(lending: LendingDeps, threadId: string, terms = TERMS): string {
  const result = recordConsent(
    { customerId: CONTEXT.customerId, conversationId: threadId, correlationId: "c", ...terms },
    lending,
  );
  if (!result.ok) throw new Error("the test's consent was refused");
  return result.consentId;
}
