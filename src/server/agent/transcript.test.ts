import { HumanMessage, AIMessage, fakeModel } from "langchain";
import { describe, expect, it } from "vitest";
import { ASSESSMENT_CALL, buildTestGraph, sendMessage, testContext } from "@/test/graph";
import { TERMS } from "@/test/lending-setup";
import { runConfig } from "./graph";
import { NEEDS_SIGN_IN } from "./templates";
import { readTranscript } from "./transcript";

describe("agent/transcript: what the customer may see", () => {
  it("FR-AGT-08: tool calls and their results are left out; the customer's message and the template stay", async () => {
    const graph = buildTestGraph(fakeModel().respondWithTools([ASSESSMENT_CALL]));
    await sendMessage(graph, "t1", "Check my loan", testContext("t1", { customerId: null }));

    const transcript = await readTranscript(graph, "t1");

    expect(transcript.messages.map(({ role, text }) => ({ role, text }))).toEqual([
      { role: "customer", text: "Check my loan" },
      { role: "assistant", text: NEEDS_SIGN_IN },
    ]);
    expect(transcript.pause).toBeNull();
  });

  it("FR-AGT-10: a model reply cut off before validation is never shown", async () => {
    const graph = buildTestGraph(fakeModel().respond(new AIMessage("You're approved!")));
    await graph.invoke(
      { messages: [new HumanMessage("Am I approved?")], journey: "loan" as const },
      { ...runConfig("t1", testContext("t1")), interruptBefore: ["validate_reply"] },
    );

    const transcript = await readTranscript(graph, "t1");

    expect(transcript.messages.map(({ text }) => text)).toEqual(["Am I approved?"]);
  });

  it("FR-WEB-04: messages before `from` are left out, and a pending card is included", async () => {
    const graph = buildTestGraph(fakeModel().respondWithTools([ASSESSMENT_CALL]));
    await sendMessage(graph, "t1", "Check my loan");

    const transcript = await readTranscript(graph, "t1", 1);

    expect(transcript.messages).toEqual([]);
    expect(transcript.pause?.pause).toEqual({ kind: "consent", ...TERMS });
  });
});
