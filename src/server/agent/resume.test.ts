import { AIMessage, fakeModel } from "langchain";
import { beforeEach, describe, expect, it } from "vitest";
import { buildTestGraph, pendingInterrupts, sendMessage } from "@/test/graph";
import { runConfig, type ConversationGraph } from "./graph";
import { REQUEST_ASSESSMENT } from "./nodes/loan-agent";
import { resumeInterrupt } from "./resume";
import { REFERRED_TO_OFFICER } from "./templates";

let graph: ConversationGraph;
let interruptId: string;

// Two conversations, each paused at consent.
beforeEach(async () => {
  const model = fakeModel()
    .respondWithTools([{ name: REQUEST_ASSESSMENT, args: {} }])
    .respondWithTools([{ name: REQUEST_ASSESSMENT, args: {} }]);
  graph = buildTestGraph(model);
  await sendMessage(graph, "t1", "Check my loan");
  await sendMessage(graph, "t2", "Check my loan too");
  const [pending] = await pendingInterrupts(graph, "t1");
  interruptId = pending!.id!;
});

const consentReference = { consentId: "consent-1" };

describe("agent/resume: pauses resume once, with a reference", () => {
  it("FR-AGT-06: a pending interrupt resumes with a consent reference and the journey continues", async () => {
    const result = await resumeInterrupt(graph, {
      threadId: "t1",
      interruptId,
      reference: consentReference,
    });

    const { values } = await graph.getState(runConfig("t1"));
    expect(result).toEqual({ ok: true });
    expect(values.consentId).toBe("consent-1");
    expect(values.messages.at(-1)?.text).toBe(REFERRED_TO_OFFICER);
  });

  it("P0-09: a replayed resume is refused and the step doesn't run twice", async () => {
    await resumeInterrupt(graph, { threadId: "t1", interruptId, reference: consentReference });
    const before = (await graph.getState(runConfig("t1"))).values.messages.length;

    const replay = await resumeInterrupt(graph, {
      threadId: "t1",
      interruptId,
      reference: { consentId: "consent-2" },
    });

    const { values } = await graph.getState(runConfig("t1"));
    expect(replay).toEqual({ ok: false, reason: "not_pending" });
    expect(values.consentId).toBe("consent-1");
    expect(values.messages).toHaveLength(before);
  });

  it("FR-AGT-06: an interrupt ID from another conversation never resumes this one", async () => {
    const result = await resumeInterrupt(graph, {
      threadId: "t2",
      interruptId,
      reference: consentReference,
    });

    expect(result).toEqual({ ok: false, reason: "not_pending" });
    expect(await pendingInterrupts(graph, "t2")).toHaveLength(1);
  });

  it("FR-AGT-06: an invented interrupt ID is refused", async () => {
    const result = await resumeInterrupt(graph, {
      threadId: "t1",
      interruptId: "not-a-real-id",
      reference: consentReference,
    });

    expect(result).toEqual({ ok: false, reason: "not_pending" });
  });

  it.each([
    { case: "consent typed as text", reference: "I consent" },
    { case: "a password", reference: { password: "hunter2" } },
    { case: "a reference with extra data", reference: { consentId: "c1", password: "hunter2" } },
    { case: "an empty reference", reference: { consentId: "" } },
  ])("P0-19: resuming with $case is refused and nothing reaches state", async ({ reference }) => {
    const result = await resumeInterrupt(graph, { threadId: "t1", interruptId, reference });

    const { values } = await graph.getState(runConfig("t1"));
    expect(result).toEqual({ ok: false, reason: "invalid_reference" });
    expect(values.consentId).toBeUndefined();
    expect(await pendingInterrupts(graph, "t1")).toHaveLength(1);
  });

  it("FR-AGT-06: typing 'I consent' in chat does not resume the pause", async () => {
    const model = fakeModel()
      .respondWithTools([{ name: REQUEST_ASSESSMENT, args: {} }])
      .respond(new AIMessage("Please use the consent card on your screen."));
    const chatGraph = buildTestGraph(model);
    await sendMessage(chatGraph, "t3", "Check my loan");

    await sendMessage(chatGraph, "t3", "I consent");

    const { values } = await chatGraph.getState(runConfig("t3"));
    expect(values.consentId).toBeUndefined();
    expect(values.decision).toBeUndefined();
    expect(await pendingInterrupts(chatGraph, "t3")).toEqual([]);
  });
});
