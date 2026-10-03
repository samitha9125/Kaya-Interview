import { fakeModel } from "langchain";
import { beforeEach, describe, expect, it } from "vitest";
import { CUSTOMER_PASSWORD } from "@/test/builders/customer";
import { chatRouteSetup, type Turn } from "@/test/chat-routes";
import { everythingStored } from "@/test/database";
import { ASSESSMENT_CALL } from "@/test/graph";

let routes: ReturnType<typeof chatRouteSetup>;

beforeEach(() => {
  routes = chatRouteSetup(
    fakeModel().respondWithTools([ASSESSMENT_CALL]).respondWithTools([ASSESSMENT_CALL]),
  );
});

// Messages on the loan journey, as if the first came from its starter.
const chat = (message: string, conversationId?: string) =>
  routes.chat(message, { conversationId, starter: "loan" });
const answer = (turn: Turn, reply: Record<string, unknown>) => routes.answer(turn, reply);

const PASSWORD_STEP_UP = { kind: "step_up", password: CUSTOMER_PASSWORD };

describe("harness/chat-routes: step-up through its card (BR-AUTH-03)", () => {
  it("P0-19: after a whole journey, the password is nowhere in the database, checkpoints included", async () => {
    const { turn } = await chat("Check my loan");
    const consent = await answer(turn, PASSWORD_STEP_UP);
    const confirm = await answer(consent.turn, { kind: "consent", agree: true });

    await answer(confirm.turn, { kind: "confirm", confirm: true });

    const stored = everythingStored(routes.handle);
    expect(stored).toContain("loan.applied");
    expect(stored).not.toContain(CUSTOMER_PASSWORD);
  });
});
