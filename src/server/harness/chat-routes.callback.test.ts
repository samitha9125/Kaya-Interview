import { fakeModel } from "langchain";
import { beforeEach, describe, expect, it } from "vitest";
import { CALLBACK_REQUESTED, CALLBACK_REQUESTED_GUEST } from "@/server/agent/templates";
import { chatRouteSetup } from "@/test/chat-routes";
import { everythingStored } from "@/test/database";

let routes: ReturnType<typeof chatRouteSetup>;

beforeEach(() => {
  routes = chatRouteSetup(fakeModel());
});

const talkToAPerson = () => routes.chat("I'd like to talk to a person.", { starter: "human" });

describe("harness/chat-routes: talk to a person (FR-AGT-14)", () => {
  it("FR-AGT-14: a signed-in customer's request is made at once, with no card", async () => {
    const { turn } = await talkToAPerson();

    expect(turn.messages.map((message) => message.text)).toEqual([CALLBACK_REQUESTED]);
    expect(turn.pause).toBeNull();
  });

  it("FR-AGT-14: a guest's card refuses bad details with each field's message", async () => {
    routes.useGuestSession();
    const { turn } = await talkToAPerson();

    const { response } = await routes.answer(turn, {
      kind: "callback_form",
      contact: { name: "K", mobileNumber: "123" },
    });

    expect(turn.pause?.kind).toBe("callback_form");
    expect(response.status).toBe(400);
    expect((await response.json()).error.fields).toEqual({
      name: "Please enter your name.",
      mobileNumber: "Please enter a Sri Lankan mobile number, such as 077 123 4567.",
    });
  });

  it("FR-PLAT-02: a guest's request is recorded with their details encrypted", async () => {
    routes.useGuestSession();
    const { turn } = await talkToAPerson();

    const done = await routes.answer(turn, {
      kind: "callback_form",
      contact: { name: "Kasun Perera", mobileNumber: "077 123 4567" },
    });

    const stored = everythingStored(routes.handle);
    expect(done.turn.messages.map((message) => message.text)).toEqual([CALLBACK_REQUESTED_GUEST]);
    expect(stored).toContain("callback.requested");
    expect(stored).not.toMatch(/Kasun|0771234567/);
  });
});
