import { Command } from "@langchain/langgraph";
import { fakeModel } from "langchain";
import { describe, expect, it } from "vitest";
import { aScore, scriptedBureau } from "@/test/fake-bureau";
import {
  ASSESSMENT_CALL,
  buildTestGraph,
  consentFor,
  pendingInterrupts,
  checkedResume,
  sendMessage,
  streamCustom,
} from "@/test/graph";
import { lendingTestSetup } from "@/test/lending-setup";
import { CHECKING_CREDIT } from "./templates";

describe("agent/progress: code reports its slow steps", () => {
  it("FR-WEB-04: the credit check reports progress on the custom stream", async () => {
    const lending = lendingTestSetup(scriptedBureau([aScore(800)]).bureau).deps;
    const graph = buildTestGraph(fakeModel().respondWithTools([ASSESSMENT_CALL]), { lending });
    await sendMessage(graph, "t1", "Check my loan");
    const [pending] = await pendingInterrupts(graph, "t1");
    const reference = { consentId: consentFor(lending, "t1") };

    const chunks = await streamCustom(
      graph,
      "t1",
      new Command({ resume: await checkedResume(graph, "t1", pending!.id!, reference) }),
    );

    expect(chunks).toEqual([{ progress: CHECKING_CREDIT }]);
  });
});
