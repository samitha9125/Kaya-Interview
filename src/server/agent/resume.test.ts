import { fakeModel } from "langchain";
import { beforeEach, describe, expect, it } from "vitest";
import type { LendingDeps } from "@/server/modules/lending";
import { aScore, scriptedBureau } from "@/test/fake-bureau";
import {
  ASSESSMENT_CALL,
  buildTestGraph,
  consentFor,
  pendingInterrupts,
  resume,
  sendMessage,
} from "@/test/graph";
import { lendingTestSetup } from "@/test/lending-setup";
import { runConfig, type ConversationGraph } from "./graph";

let graph: ConversationGraph;
let lending: LendingDeps;
let interruptId: string;

// Two conversations, each paused at consent.
beforeEach(async () => {
  lending = lendingTestSetup(scriptedBureau([aScore(800)]).bureau).deps;
  const model = fakeModel().respondWithTools([ASSESSMENT_CALL]).respondWithTools([ASSESSMENT_CALL]);
  graph = buildTestGraph(model, { lending });
  await sendMessage(graph, "t1", "Check my loan");
  await sendMessage(graph, "t2", "Check my loan too");
  const [pending] = await pendingInterrupts(graph, "t1");
  interruptId = pending!.id!;
});

const stateOf = async (threadId: string) => (await graph.getState(runConfig(threadId))).values;

describe("agent/resume: pauses resume once, with a reference", () => {
  it("P0-09: a replayed resume is refused and the step doesn't run twice", async () => {
    const consentId = consentFor(lending, "t1");
    await resume(graph, "t1", interruptId, { consentId });
    const before = (await stateOf("t1")).messages.length;

    const replay = await resume(graph, "t1", interruptId, { consentId: consentFor(lending, "t1") });

    const values = await stateOf("t1");
    expect(replay).toEqual({ ok: false, reason: "not_pending" });
    expect(values.consentId).toBe(consentId);
    expect(values.messages).toHaveLength(before);
  });

  it("FR-AGT-06: an interrupt ID from another conversation never resumes this one", async () => {
    const result = await resume(graph, "t2", interruptId, { consentId: consentFor(lending, "t2") });

    expect(result).toEqual({ ok: false, reason: "not_pending" });
    expect(await pendingInterrupts(graph, "t2")).toHaveLength(1);
  });

  it.each([{ case: "a password", reference: { password: "hunter2" } }])(
    "P0-19: resuming with $case is refused and nothing reaches state",
    async ({ reference }) => {
      const result = await resume(graph, "t1", interruptId, reference);

      expect(result).toEqual({ ok: false, reason: "invalid_reference" });
      expect((await stateOf("t1")).consentId).toBeNull();
      expect(await pendingInterrupts(graph, "t1")).toHaveLength(1);
    },
  );
});
