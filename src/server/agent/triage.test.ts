import { AIMessage, fakeModel, HumanMessage, ToolMessage } from "langchain";
import { describe, expect, it } from "vitest";
import { DEFAULT_MODELS } from "@/server/modules/settings";
import { scriptedBureau } from "@/test/fake-bureau";
import {
  ACCOUNT_OPENING_CALL,
  buildTestGraph,
  pendingInterrupts,
  startJourney,
  testContext,
} from "@/test/graph";
import { lendingTestSetup } from "@/test/lending-setup";
import { runConfig } from "./graph";
import type { ModelRequest } from "./ports";
import { ASSISTANT_UNAVAILABLE, OTHER_TOPIC } from "./templates";

const HAND_BACK = { name: "hand_back", args: {}, id: "call-hb" };

// The real graph with one scripted model for every role; the provider
// records which role's model each call asked for.
function setup(model: ReturnType<typeof fakeModel>) {
  const requests: string[] = [];
  const provider = {
    chatModel: (request: ModelRequest) => {
      requests.push(request.modelId);
      return model;
    },
  };
  const lending = lendingTestSetup(scriptedBureau([]).bureau).deps;
  const graph = buildTestGraph(model, { lending, models: provider });
  const send = (text: string, context = testContext("t1")) =>
    graph.invoke({ messages: [new HumanMessage(text)] }, runConfig("t1", context));
  const triageCalls = () => requests.filter((id) => id === DEFAULT_MODELS.triage).length;
  const loanCalls = () => requests.filter((id) => id === DEFAULT_MODELS.loan).length;
  const state = async () => (await graph.getState(runConfig("t1"))).values;
  return { graph, send, triageCalls, loanCalls, state };
}

describe("agent/triage: routing (FR-AGT-01)", () => {
  it("FR-AGT-01: a message with no journey is classified, and the route becomes the journey", async () => {
    const t = setup(
      fakeModel().structuredResponse({ route: "kyc" }).respondWithTools([ACCOUNT_OPENING_CALL]),
    );

    await t.send("How do I open an account?");

    const [pending] = await pendingInterrupts(t.graph, "t1");
    expect(pending?.value).toEqual({ kind: "kyc_form" });
    expect((await t.state()).journey).toBe("kyc");
  });

  it("FR-AGT-01: a starter button costs no triage call", async () => {
    const t = setup(fakeModel().respond(new AIMessage("How much would you like?")));

    await startJourney(t.graph, "t1", "loan", "I'd like to check a loan.");

    expect(t.triageCalls()).toBe(0);
  });

  it("FR-AGT-01: routing is sticky: the next message goes straight to the specialist", async () => {
    const t = setup(
      fakeModel()
        .structuredResponse({ route: "loan" })
        .respond(new AIMessage("How much would you like?"))
        .respond(new AIMessage("And over how many months?")),
    );
    await t.send("Can I borrow money?");

    await t.send("About 500,000");

    expect(t.triageCalls()).toBe(1);
    expect(t.loanCalls()).toBe(2);
  });

  it("P1-14: anything else gets the code-written redirect and no specialist", async () => {
    const t = setup(fakeModel().structuredResponse({ route: "other" }));

    await t.send("Write me a poem");

    const values = await t.state();
    expect(values.messages.at(-1)?.text).toBe(OTHER_TOPIC);
    expect(values.journey ?? null).toBeNull();
    expect(t.loanCalls()).toBe(0);
  });

  it("FR-AGT-12: triage failing → the 'unavailable' template, never the raw error", async () => {
    const lending = lendingTestSetup(scriptedBureau([]).bureau).deps;
    const failing = {
      chatModel: () => {
        throw new Error("401 invalid key sk-or-secret");
      },
    };
    const graph = buildTestGraph(fakeModel(), { lending, models: failing });

    await graph.invoke(
      { messages: [new HumanMessage("Hello")] },
      runConfig("t1", testContext("t1")),
    );

    const { values } = await graph.getState(runConfig("t1"));
    expect(values.messages.at(-1)?.text).toBe(ASSISTANT_UNAVAILABLE);
  });
});

describe("agent/triage: hand-back (FR-AGT-15)", () => {
  it("P2-02: a topic change mid-journey goes back to triage and on to the new specialist", async () => {
    const t = setup(
      fakeModel()
        .structuredResponse({ route: "kyc" })
        .respondWithTools([HAND_BACK])
        .respondWithTools([ACCOUNT_OPENING_CALL]),
    );

    await startJourney(t.graph, "t1", "loan", "Actually, I want to open an account");

    const [pending] = await pendingInterrupts(t.graph, "t1");
    expect(pending?.value).toEqual({ kind: "kyc_form" });
    expect((await t.state()).journey).toBe("kyc");
  });

  it("P2-01: a misrouted message isn't sent straight back to the specialist that returned it", async () => {
    const t = setup(
      fakeModel().structuredResponse({ route: "loan" }).respondWithTools([HAND_BACK]),
    );

    await t.send("Something odd");

    expect(t.loanCalls()).toBe(1);
    expect((await t.state()).messages.at(-1)?.text).toBe(OTHER_TOPIC);
  });

  it("FR-AGT-08: after a hand-back to a callback, the specialist's tool result reads HANDED_TO_PERSON", async () => {
    const t = setup(
      fakeModel().structuredResponse({ route: "human" }).respondWithTools([HAND_BACK]),
    );

    await startJourney(t.graph, "t1", "loan", "Can someone call me?");

    const result = (await t.state()).messages.find(ToolMessage.isInstance);
    expect(result?.content).toBe("HANDED_TO_PERSON");
  });
});
