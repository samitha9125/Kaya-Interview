import { Command, MemorySaver, type BaseCheckpointSaver } from "@langchain/langgraph";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage } from "langchain";
import type { ConversationContextValue } from "@/server/agent/context";
import { buildConversationGraph, runConfig, type ConversationGraph } from "@/server/agent/graph";
import type { ChatModelProvider } from "@/server/agent/ports";
import { prepareResume } from "@/server/agent/resume";
import { recordConsent, type LendingDeps } from "@/server/modules/lending";
import type { OnboardingDeps } from "@/server/modules/onboarding";
import { TEST_ENCRYPTION_KEY } from "@/test/fakes";
import { DEFAULT_MODELS } from "@/server/modules/settings";
import { scriptedBureau } from "@/test/fake-bureau";
import { CONTEXT, lendingTestSetup, TERMS } from "@/test/lending-setup";

export type TestGraphOptions = {
  lending?: LendingDeps;
  onboarding?: OnboardingDeps;
  isStepUpFresh?: (sessionId: string) => boolean;
  checkpointer?: BaseCheckpointSaver;
  models?: ChatModelProvider;
};

// The real graph with a scripted model, in-memory checkpoints and real
// lending on in-memory SQLite. The step-up check is auth's, so a test
// decides it; everything else runs for real.
export function buildTestGraph(model: BaseChatModel, options: TestGraphOptions = {}) {
  const lending = options.lending ?? lendingTestSetup(scriptedBureau([]).bureau).deps;
  return buildConversationGraph({
    models: options.models ?? { chatModel: () => model },
    lending,
    onboarding: options.onboarding ?? onboardingTestDeps(lending),
    isStepUpFresh: options.isStepUpFresh ?? (() => true),
    checkpointer: options.checkpointer ?? new MemorySaver(),
    // Retries without real waiting (TESTING_STANDARDS §5).
    modelRetry: { initialDelayMs: 0 },
  });
}

// Real onboarding on the same database as lending; no applicant is an
// existing customer unless a test says so.
export function onboardingTestDeps(
  { db, audit, clock, ids }: LendingDeps,
  isExistingCustomerNic: (nic: string) => boolean = () => false,
): OnboardingDeps {
  return { db, audit, clock, ids, encryptionKey: TEST_ENCRYPTION_KEY, isExistingCustomerNic };
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

// A message sent from a starter button, which picks the specialist.
export function startJourney(
  graph: ConversationGraph,
  threadId: string,
  journey: "loan" | "kyc",
  text: string,
  context = testContext(threadId),
) {
  return graph.invoke(
    { messages: [new HumanMessage(text)], journey },
    runConfig(threadId, context),
  );
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

// What nodes wrote on the custom stream while running `input` (FR-WEB-04).
export async function streamCustom(
  graph: ConversationGraph,
  threadId: string,
  input: Parameters<ConversationGraph["stream"]>[0],
  context = testContext(threadId),
): Promise<unknown[]> {
  const chunks: unknown[] = [];
  const stream = await graph.stream(input, {
    ...runConfig(threadId, context),
    streamMode: "custom",
  });
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

// The checked resume map for a pause the test expects to be pending.
export async function checkedResume(
  graph: ConversationGraph,
  threadId: string,
  interruptId: string,
  reference: unknown,
) {
  const prepared = await prepareResume(graph, { threadId, interruptId, reference });
  if (!prepared.ok) throw new Error(`the resume was refused: ${prepared.reason}`);
  return prepared.resume;
}

export async function pendingInterrupts(graph: ConversationGraph, threadId: string) {
  const snapshot = await graph.getState(runConfig(threadId));
  return snapshot.tasks.flatMap((task) => task.interrupts);
}

// The model asks for an assessment at once: the adversarial case, before
// any sign-in, step-up or consent (TESTING_STANDARDS §7).
export const ASSESSMENT_CALL = { name: "request_assessment", args: TERMS, id: "call-1" };

export const ACCOUNT_OPENING_CALL = { name: "start_account_opening", args: {}, id: "call-k1" };

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
