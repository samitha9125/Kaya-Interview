import { AIMessage, fakeModel, HumanMessage } from "langchain";
import { describe, expect, it } from "vitest";
import { ASSESSMENT_CALL, buildTestGraph, sendMessage } from "@/test/graph";
import { runConfig } from "./graph";
import { callsSoFar, turnLimits } from "./limits";
import { BANK_AUTHOR } from "./nodes/endings";
import { ASSISTANT_UNAVAILABLE, LIMIT_REACHED } from "./templates";

const modelReply = () => new AIMessage("A reply.");
const bankReply = () => new AIMessage({ content: "A template.", name: BANK_AUTHOR });

describe("agent/limits: counting from the conversation (FR-AGT-11)", () => {
  it("FR-AGT-11: the model's replies and tool calls count; code-written replies don't", () => {
    const toolReply = new AIMessage({ content: "", tool_calls: [{ ...ASSESSMENT_CALL }] });

    expect(callsSoFar([new HumanMessage("hi"), modelReply(), toolReply, bankReply()])).toEqual({
      modelCalls: 2,
      toolCalls: 1,
    });
  });

  it.each([
    { used: 0, expected: 5 },
    { used: 57, expected: 3 },
    { used: 60, expected: 0 },
  ])(
    "FR-AGT-11: with $used model calls so far, this turn may make $expected",
    ({ used, expected }) => {
      const history = Array.from({ length: used }, modelReply);

      expect(turnLimits(history).modelCalls).toBe(expected);
    },
  );
});

const INVALID_CALL = { ...ASSESSMENT_CALL, args: { amountLkr: 1, termMonths: 1 } };

describe("agent/limits: a model that won't stop (P1-10)", () => {
  it("P1-10: a model looping on its tool stops at 3 tool calls; the customer gets the apology", async () => {
    const model = fakeModel()
      .respondWithTools([{ ...INVALID_CALL, id: "c1" }])
      .respondWithTools([{ ...INVALID_CALL, id: "c2" }])
      .respondWithTools([{ ...INVALID_CALL, id: "c3" }])
      .respondWithTools([{ ...INVALID_CALL, id: "c4" }])
      .respondWithTools([{ ...INVALID_CALL, id: "c5" }]);
    const graph = buildTestGraph(model);

    const result = await sendMessage(graph, "t1", "Loan please");

    expect(result.messages.at(-1)?.text).toBe(LIMIT_REACHED);
    expect(model.callCount).toBe(4);
  });

  it("P1-10: a conversation that has used its 60 model calls gets the apology without a call", async () => {
    const model = fakeModel().respond(modelReply());
    const graph = buildTestGraph(model);
    const history = Array.from({ length: 60 }, modelReply);
    await graph.updateState(runConfig("t1"), { messages: history });

    const result = await sendMessage(graph, "t1", "One more thing");

    expect(result.messages.at(-1)?.text).toBe(LIMIT_REACHED);
    expect(model.callCount).toBe(0);
  });
});

describe("agent/limits: model failures (FR-AGT-12)", () => {
  it("P1-07: a failing model is tried 3 times (2 retries), then the customer gets the unavailable template", async () => {
    const model = fakeModel().alwaysThrow(new Error("503 upstream error from provider"));
    const graph = buildTestGraph(model);

    const result = await sendMessage(graph, "t1", "Hello");

    const state = JSON.stringify((await graph.getState(runConfig("t1"))).values);
    expect(result.messages.at(-1)?.text).toBe(ASSISTANT_UNAVAILABLE);
    expect(model.callCount).toBe(3);
    expect(state).not.toContain("upstream");
  });

  it("P1-06: a missing or refused key → the unavailable template, no raw error", async () => {
    const keyless = {
      chatModel: () => {
        throw new Error("OpenRouter API key is required");
      },
    };
    const noKey = buildTestGraph(fakeModel(), { models: keyless });

    const result = await sendMessage(noKey, "t1", "Hello");

    expect(result.messages.at(-1)?.text).toBe(ASSISTANT_UNAVAILABLE);
    expect(JSON.stringify(result.messages)).not.toContain("API key");
  });
});

describe("agent/limits: NIC-shaped text in model output (FR-AGT-09)", () => {
  it("P0-06: a NIC in the model's reply is redacted before it is stored or shown", async () => {
    // Made-up NIC. secret-scan:ignore
    const graph = buildTestGraph(fakeModel().respond(new AIMessage("I see NIC 199012345678.")));

    const result = await sendMessage(graph, "t1", "What NIC do you have for me?");

    expect(result.messages.at(-1)?.text).not.toContain("199012345678");
  });
});
