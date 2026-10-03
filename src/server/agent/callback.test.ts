import { fakeModel } from "langchain";
import { beforeEach, describe, expect, it } from "vitest";
import { scriptedBureau } from "@/test/fake-bureau";
import { buildTestGraph, pendingInterrupts, resume, startJourney, testContext } from "@/test/graph";
import { lendingTestSetup } from "@/test/lending-setup";
import { TEST_ENCRYPTION_KEY } from "@/test/fakes";
import { requestCallback } from "./callbacks/requests";
import { runConfig, type ConversationGraph } from "./graph";
import {
  CALLBACK_ALREADY,
  CALLBACK_CANCELLED,
  CALLBACK_REQUESTED,
  CALLBACK_REQUESTED_GUEST,
} from "./templates";

const GUEST = testContext("t1", { customerId: null });

let setup: ReturnType<typeof lendingTestSetup>;
let graph: ConversationGraph;

beforeEach(() => {
  setup = lendingTestSetup(scriptedBureau([]).bureau);
  graph = buildTestGraph(fakeModel(), { lending: setup.deps });
});

const talkToAPerson = (context = testContext("t1")) =>
  startJourney(graph, "t1", "human", "I'd like to talk to a person.", context);
const state = async () => (await graph.getState(runConfig("t1"))).values;
const callbacks = () =>
  setup.handle.sqlite.prepare("SELECT customer_id, reason FROM callback_requests").all();

describe("agent/callback: talk to a person (FR-AGT-14)", () => {
  it("FR-AGT-14: a signed-in customer's request is made from their record at once", async () => {
    await talkToAPerson();

    expect((await state()).messages.at(-1)?.text).toBe(CALLBACK_REQUESTED);
    expect(callbacks()).toEqual([{ customer_id: "customer-a", reason: "general" }]);
  });

  it("FR-AGT-14: asking again in the conversation finds the first request", async () => {
    await talkToAPerson();

    await talkToAPerson();

    expect((await state()).messages.at(-1)?.text).toBe(CALLBACK_ALREADY);
    expect(callbacks()).toHaveLength(1);
  });

  it("FR-AGT-01: the request lasts one turn, so the next message meets triage again", async () => {
    await talkToAPerson();

    expect((await state()).journey ?? null).toBeNull();
  });

  it("FR-AGT-14: a guest is asked for a name and number on a card, and the request is its ID", async () => {
    await talkToAPerson(GUEST);
    const [pending] = await pendingInterrupts(graph, "t1");
    const callbackId = requestCallback(
      {
        conversationId: "t1",
        correlationId: "c",
        reason: "general",
        caller: { guestSessionId: "s1", contact: { name: "Kasun", mobileNumber: "0771234567" } },
      },
      { ...setup.deps, encryptionKey: TEST_ENCRYPTION_KEY },
    );

    await resume(graph, "t1", pending!.id!, { callbackId }, GUEST);

    expect(pending?.value).toEqual({ kind: "callback_form", reason: "general" });
    expect((await state()).messages.at(-1)?.text).toBe(CALLBACK_REQUESTED_GUEST);
  });

  it("TD14: a guest who leaves the card is told nothing was asked", async () => {
    await talkToAPerson(GUEST);
    const [pending] = await pendingInterrupts(graph, "t1");

    await resume(graph, "t1", pending!.id!, { declined: true }, GUEST);

    expect((await state()).messages.at(-1)?.text).toBe(CALLBACK_CANCELLED);
    expect(callbacks()).toEqual([]);
  });
});
