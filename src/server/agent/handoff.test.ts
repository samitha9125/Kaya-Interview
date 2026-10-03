import { AIMessage, fakeModel, ToolMessage } from "langchain";
import { describe, expect, it } from "vitest";
import { buildTestGraph, pendingInterrupts, sendMessage } from "@/test/graph";
import { runConfig } from "./graph";
import { REQUEST_ASSESSMENT } from "./nodes/loan-agent";

function modelRequestingAssessment() {
  return fakeModel().respondWithTools([{ name: REQUEST_ASSESSMENT, args: {}, id: "call-1" }]);
}

describe("agent graph: specialist hands off to deterministic steps", () => {
  it("FR-AGT-05: request_assessment hands off through Command.PARENT and pauses at consent", async () => {
    const graph = buildTestGraph(modelRequestingAssessment());

    await sendMessage(graph, "t1", "Can I get a loan?");

    const snapshot = await graph.getState(runConfig("t1"));
    expect(snapshot.next).toEqual(["consent"]);
    expect((await pendingInterrupts(graph, "t1")).map((item) => item.value)).toEqual([
      { kind: "consent" },
    ]);
  });

  it("FR-AGT-05: the handoff stops the specialist; it isn't called again after the tool", async () => {
    const model = modelRequestingAssessment();
    const graph = buildTestGraph(model);

    await sendMessage(graph, "t1", "Can I get a loan?");

    expect(model.callCount).toBe(1);
  });

  it("FR-AGT-05: the tool call and its result both reach the parent, so history stays valid", async () => {
    const graph = buildTestGraph(modelRequestingAssessment());

    await sendMessage(graph, "t1", "Can I get a loan?");

    const { values } = await graph.getState(runConfig("t1"));
    const [, aiMessage, toolMessage] = values.messages;
    expect(AIMessage.isInstance(aiMessage) && aiMessage.tool_calls?.[0]?.id).toBe("call-1");
    expect(ToolMessage.isInstance(toolMessage) && toolMessage.tool_call_id).toBe("call-1");
  });

  it("FR-AGT-02: a plain reply ends the turn without leaving the specialist", async () => {
    const graph = buildTestGraph(fakeModel().respond(new AIMessage("Loans run 6 to 60 months.")));

    const result = await sendMessage(graph, "t1", "How long can a loan be?");

    expect(result.messages.at(-1)?.text).toBe("Loans run 6 to 60 months.");
    expect(await pendingInterrupts(graph, "t1")).toEqual([]);
  });
});
