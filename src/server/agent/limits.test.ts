import { AIMessage, fakeModel } from "langchain";
import { describe, expect, it } from "vitest";
import { buildTestGraph, sendMessage } from "@/test/graph";
import { ASSISTANT_UNAVAILABLE, LIMIT_REACHED } from "./templates";

describe("agent/limits: NIC-shaped text in model output (FR-AGT-09)", () => {
  it("P0-06: a NIC in the model's reply is redacted before it is stored or shown", async () => {
    // Made-up NIC. secret-scan:ignore
    const graph = buildTestGraph(fakeModel().respond(new AIMessage("I see NIC 199012345678.")));

    const result = await sendMessage(graph, "t1", "What NIC do you have for me?");

    expect(result.messages.at(-1)?.text).not.toContain("199012345678");
  });
});

describe("agent/limits: a turn that runs away or a model that fails (FR-AGT-11, FR-AGT-12)", () => {
  const LOOKUP = { name: "look_up_rates", args: {}, id: "call-loop" };

  it("P1-10: a model that keeps calling tools is stopped with the limit template", async () => {
    const graph = buildTestGraph(
      fakeModel()
        .respondWithTools([LOOKUP])
        .respondWithTools([LOOKUP])
        .respondWithTools([LOOKUP])
        .respondWithTools([LOOKUP])
        .respondWithTools([LOOKUP])
        .respondWithTools([LOOKUP]),
    );

    const result = await sendMessage(graph, "t1", "Check a loan for me.");

    expect(result.messages.at(-1)?.text).toBe(LIMIT_REACHED);
  });

  it("P1-06: a model that always fails gets the unavailable template", async () => {
    const graph = buildTestGraph(fakeModel().alwaysThrow(new Error("401 from provider")));

    const result = await sendMessage(graph, "t1", "Check a loan for me.");

    expect(result.messages.at(-1)?.text).toBe(ASSISTANT_UNAVAILABLE);
  });
});
