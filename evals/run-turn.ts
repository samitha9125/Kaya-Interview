import { randomUUID } from "node:crypto";
import { MemorySaver } from "@langchain/langgraph";
import { AIMessage, HumanMessage, type BaseMessage } from "langchain";
import { OpenRouterProvider } from "@/server/adapters/openrouter-provider";
import { buildConversationGraph, runConfig } from "@/server/agent/graph";
import { findPendingPause } from "@/server/agent/resume";
import { DEFAULT_MODELS } from "@/server/modules/settings";
import { findAuditEvents } from "@/server/platform/audit";
import { getConfig } from "@/server/platform/config";
import { scriptedBureau } from "@/test/fake-bureau";
import { callbackTestDeps, onboardingTestDeps, testContext } from "@/test/graph";
import { lendingTestSetup } from "@/test/lending-setup";
import { afterOutcome, type QuestionedEnding } from "./after-outcome";

// promptfoo's exec provider calls this with the customer's message, the
// provider options (the models under test) and the test's vars. It runs
// one turn of the real graph on a real model, with real lending,
// onboarding and callbacks on in-memory SQLite, and prints what the turn
// did as JSON, with its input and output tokens. The customer is signed
// in but hasn't re-entered their password, so an assessment stops at the
// step-up card and the bureau is never reached. With `after`, the turn is a follow-up to that ending
// (see after-outcome.ts).
type Options = { config?: { models?: Partial<typeof DEFAULT_MODELS> } };
type Vars = { journey?: "loan" | "kyc" | "human"; after?: QuestionedEnding };
type Tokens = { input: number; output: number } | null;

const SPECIALISTS = new Set(["loan_agent", "kyc_agent", "callback"]);

async function runTurn(message: string, options: Options, vars: Vars) {
  const { OPENROUTER_API_KEY } = getConfig();
  const lending = lendingTestSetup(scriptedBureau([]).bureau).deps;
  const graph = buildConversationGraph({
    models: new OpenRouterProvider({ apiKey: OPENROUTER_API_KEY }),
    lending,
    onboarding: onboardingTestDeps(lending),
    callbacks: callbackTestDeps(lending),
    isStepUpFresh: () => false,
    checkpointer: new MemorySaver(),
  });
  const threadId = randomUUID();
  const context = testContext(threadId, {
    models: { ...DEFAULT_MODELS, ...options.config?.models },
  });
  const earlier = vars.after ? afterOutcome(vars.after) : { history: [], decision: null };
  const input = {
    messages: [...earlier.history, new HumanMessage(message)],
    journey: vars.journey,
    decision: earlier.decision,
  };

  const started = performance.now();
  const nodes: string[] = [];
  const stream = await graph.stream(input, {
    ...runConfig(threadId, context),
    streamMode: "updates",
  });
  for await (const update of stream) nodes.push(...Object.keys(update));
  const ms = Math.round(performance.now() - started);

  const snapshot = await graph.getState(runConfig(threadId));
  const messages: BaseMessage[] = snapshot.values.messages ?? [];
  const thisTurn = messages.slice(messages.findLastIndex((m) => HumanMessage.isInstance(m)));
  const replies = thisTurn.filter((m): m is AIMessage => AIMessage.isInstance(m));
  const pending = await findPendingPause(graph, threadId);
  // Every model call this turn, triage included, as the audit counts them.
  const tokens = findAuditEvents(lending.db, context.correlationId)
    .filter((event) => event.type === "agent.reply")
    .map((event) => event.payload.tokens as Tokens)
    .reduce<{ input: number; output: number }>(
      (sum, call) => ({
        input: sum.input + (call?.input ?? 0),
        output: sum.output + (call?.output ?? 0),
      }),
      { input: 0, output: 0 },
    );
  return {
    reply: replies
      .filter((m) => !m.tool_calls?.length)
      .map((m) => m.text)
      .join("\n"),
    route: nodes.find((node) => SPECIALISTS.has(node))?.replace("_agent", "") ?? "other",
    tools: replies.flatMap((m) => m.tool_calls?.map((call) => call.name) ?? []),
    pause: pending?.pause.kind ?? null,
    tokens,
    ms,
  };
}

// promptfoo runs this from evals/; the database migrations are found from
// the repository root.
process.chdir("..");
const [message = "", options = "{}", context = "{}"] = process.argv.slice(2);
runTurn(
  message,
  JSON.parse(options) as Options,
  (JSON.parse(context) as { vars?: Vars }).vars ?? {},
)
  .then((result) => console.log(JSON.stringify(result)))
  .catch((error: unknown) => {
    console.log(JSON.stringify({ error: error instanceof Error ? error.name : "unknown" }));
  });
