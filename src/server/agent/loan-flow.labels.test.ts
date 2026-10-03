import { fakeModel, ToolMessage, type BaseMessage } from "langchain";
import { describe, expect, it } from "vitest";
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

// FR-AGT-08: the model learns which ending the customer was shown, so a
// follow-up ("really?") can stay consistent with it. A score of 400 is
// band D (not eligible); 655 is near a band edge, so confidence drops
// below the threshold and the case is referred, which opens an application.
function setup(score: number) {
  const scripted = scriptedBureau([aScore(score)]);
  const lending = lendingTestSetup(scripted.bureau);
  const model = fakeModel().respondWithTools([ASSESSMENT_CALL]).respondWithTools([ASSESSMENT_CALL]);
  const graph = buildTestGraph(model, { lending: lending.deps, isStepUpFresh: () => true });
  const pending = async () => (await pendingInterrupts(graph, "t1"))[0]!.id!;
  return { graph, lending, calls: scripted.calls, pending };
}

const lastLabel = (messages: BaseMessage[]) =>
  messages.filter((message) => ToolMessage.isInstance(message)).at(-1)?.text;

async function assess(score: number) {
  const context = setup(score);
  await sendMessage(context.graph, "t1", "Check my loan");
  await resume(context.graph, "t1", await context.pending(), {
    consentId: consentFor(context.lending.deps, "t1"),
  });
  return context;
}

describe("agent/loan flow: situation labels (FR-AGT-08)", () => {
  it("FR-AGT-08: a not-eligible result is labelled NOT_ELIGIBLE for the model", async () => {
    const { graph } = await assess(400);

    const { values } = await graph.getState({ configurable: { thread_id: "t1" } });

    expect(lastLabel(values.messages)).toBe("NOT_ELIGIBLE");
  });

  it("FR-AGT-08: asking again with an application open is labelled APPLICATION_ALREADY_OPEN, and no check runs", async () => {
    const { graph, calls } = await assess(655);

    const result = await sendMessage(graph, "t1", "Check my loan again");

    expect(lastLabel(result.messages)).toBe("APPLICATION_ALREADY_OPEN");
    expect(calls).toHaveLength(1);
  });
});
