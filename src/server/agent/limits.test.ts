import { AIMessage, fakeModel } from "langchain";
import { describe, expect, it } from "vitest";
import { buildTestGraph, sendMessage } from "@/test/graph";

describe("agent/limits: NIC-shaped text in model output (FR-AGT-09)", () => {
  it("P0-06: a NIC in the model's reply is redacted before it is stored or shown", async () => {
    // Made-up NIC. secret-scan:ignore
    const graph = buildTestGraph(fakeModel().respond(new AIMessage("I see NIC 199012345678.")));

    const result = await sendMessage(graph, "t1", "What NIC do you have for me?");

    expect(result.messages.at(-1)?.text).not.toContain("199012345678");
  });
});
