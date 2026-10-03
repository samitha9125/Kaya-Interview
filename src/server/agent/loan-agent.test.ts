import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { AIMessage, fakeModel, ToolMessage, type BaseMessage } from "langchain";
import { describe, expect, it } from "vitest";
import { noHistory, scriptedBureau, serverError } from "@/test/fake-bureau";
import {
  ASSESSMENT_CALL,
  buildTestGraph,
  consentFor,
  pendingInterrupts,
  resume,
  sendMessage,
  testContext,
} from "@/test/graph";
import { lendingTestSetup } from "@/test/lending-setup";
import { runConfig, type ConversationGraph } from "./graph";
import { requestAssessment } from "./nodes/loan-agent";
import { LOAN_PROMPT } from "./prompts/loan";
import { TONE_GUIDE } from "./prompts/tone";

async function toolResults(graph: ConversationGraph, threadId = "t1"): Promise<string[]> {
  const messages: BaseMessage[] = (await graph.getState(runConfig(threadId))).values.messages;
  return messages.filter(ToolMessage.isInstance).map((message) => message.text);
}

describe("agent/loan agent: its one tool (FR-AGT-02, FR-AGT-04)", () => {
  it("FR-AGT-04: request_assessment takes the amount and term only, nothing identifying", () => {
    const schema = toJsonSchema(requestAssessment.schema) as { properties: object };

    expect(Object.keys(schema.properties).sort()).toEqual(["amountLkr", "termMonths"]);
  });

  it("P1-09: terms outside the product → INVALID_INPUT with a hint, no handoff, and the model asks again", async () => {
    const model = fakeModel()
      .respondWithTools([{ ...ASSESSMENT_CALL, args: { amountLkr: 10_000, termMonths: 36 } }])
      .respond(new AIMessage("The smallest loan is LKR 50,000. How much would you like?"));
    const graph = buildTestGraph(model);

    const result = await sendMessage(graph, "t1", "Can I borrow 10,000?");

    const [label] = await toolResults(graph);
    expect(label).toMatch(
      /^INVALID_INPUT: The amount must be a whole number of rupees from LKR 50,000/,
    );
    expect(label).not.toMatch(/zod|too_small|expected|Received tool input/i);
    expect(await pendingInterrupts(graph, "t1")).toEqual([]);
    expect(result.messages.at(-1)?.text).toBe(
      "The smallest loan is LKR 50,000. How much would you like?",
    );
  });

  it("FR-AGT-16: the loan prompt carries the shared tone guide", () => {
    expect(LOAN_PROMPT).toContain(TONE_GUIDE);
  });
});

describe("agent/loan agent: what the LLM learns afterwards is a label (FR-AGT-08)", () => {
  function journey(bureau = scriptedBureau([noHistory]).bureau) {
    const lending = lendingTestSetup(bureau);
    const graph = buildTestGraph(fakeModel().respondWithTools([ASSESSMENT_CALL]), {
      lending: lending.deps,
    });
    const consent = async () => {
      await sendMessage(graph, "t1", "Check my loan");
      const [pause] = await pendingInterrupts(graph, "t1");
      return { graph, pauseId: pause!.id!, consentId: consentFor(lending.deps, "t1") };
    };
    return { graph, consent };
  }

  it("FR-AGT-08: a guest → NEEDS_SIGN_IN", async () => {
    const { graph } = journey();

    await sendMessage(graph, "t1", "Check my loan", testContext("t1", { customerId: null }));

    expect(await toolResults(graph)).toEqual(["NEEDS_SIGN_IN"]);
  });

  it("FR-AGT-08: a referral → REFERRED", async () => {
    const { consent } = journey();
    const { graph, pauseId, consentId } = await consent();

    await resume(graph, "t1", pauseId, { consentId });

    expect(await toolResults(graph)).toEqual(["REFERRED"]);
  });

  it("FR-AGT-08: declined consent → NEEDS_CONSENT", async () => {
    const { consent } = journey();
    const { graph, pauseId } = await consent();

    await resume(graph, "t1", pauseId, { declined: true });

    expect(await toolResults(graph)).toEqual(["NEEDS_CONSENT"]);
  });

  it("FR-AGT-08: an outage → CHECK_UNAVAILABLE_TODAY, and no internal reason anywhere in state", async () => {
    const { consent } = journey(scriptedBureau([serverError, serverError]).bureau);
    const { graph, pauseId, consentId } = await consent();

    await resume(graph, "t1", pauseId, { consentId });

    const state = JSON.stringify((await graph.getState(runConfig("t1"))).values);
    expect(await toolResults(graph)).toEqual(["CHECK_UNAVAILABLE_TODAY"]);
    expect(state).not.toMatch(/unavailable"|server_error|budget|cooling|blocked/);
  });
});
