import { AIMessage, fakeModel } from "langchain";
import { describe, expect, it } from "vitest";
import { checkpointsStored, everythingStored } from "@/test/database";
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
import { createCheckpointer } from "./checkpointer";

// A score no other number in the run is likely to match.
const SCORE = /\b733\b/;

describe("agent/loan flow: the score stays with the bank (BR-LEND-11)", () => {
  it("BR-LEND-11: after a check and a follow-up, the score is in no model input and no checkpoint", async () => {
    const setup = lendingTestSetup(scriptedBureau([aScore(733)]).bureau);
    const model = fakeModel()
      .respondWithTools([ASSESSMENT_CALL])
      .respond(new AIMessage("I can't share that, but the team can help."));
    const graph = buildTestGraph(model, {
      lending: setup.deps,
      checkpointer: createCheckpointer(setup.handle.sqlite),
    });
    await sendMessage(graph, "t1", "Check my loan");
    const [consent] = await pendingInterrupts(graph, "t1");
    await resume(graph, "t1", consent!.id!, { consentId: consentFor(setup.deps, "t1") });

    await sendMessage(graph, "t1", "What's my credit score?");

    expect(everythingStored(setup.handle)).toMatch(SCORE);
    expect(model.callCount).toBe(2);
    expect(JSON.stringify(model.calls)).not.toMatch(SCORE);
    expect(checkpointsStored(setup.handle)).not.toMatch(SCORE);
  });
});
