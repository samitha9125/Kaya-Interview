import { fakeModel } from "langchain";
import { beforeEach, describe, expect, it } from "vitest";
import { CUSTOMER_PASSWORD } from "@/test/builders/customer";
import { chatRouteSetup, type Turn } from "@/test/chat-routes";
import { postChatMessage } from "./chat-routes";
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

// A message from the signed-in customer's browser, but with the Origin a
// test chooses (none at all when null).
function fromOrigin(origin: string | null) {
  const headers = new Headers({
    host: "localhost:3000",
    cookie: `__Host-session=${routes.token()}`,
  });
  if (origin) headers.set("origin", origin);
  const body = {
    idempotencyKey: "00000000-0000-4000-8000-0000000000ff",
    message: "Hi",
    starter: "loan",
  };
  return new Request("http://localhost:3000/api/chat", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("harness/chat-routes: only the bank's own pages may post (FR-WEB-01)", () => {
  it.each([
    { case: "no Origin", origin: null },
    { case: "a foreign Origin", origin: "https://attacker.example" },
  ])("FR-WEB-01: a chat message with $case → 403", async ({ origin }) => {
    const response = await postChatMessage(fromOrigin(origin), routes.deps);

    expect(response.status).toBe(403);
  });
});

describe("harness/chat-routes: one turn at a time (FR-WEB-03)", () => {
  it("P1-15: a chat message while a card waits → 409, and the card can still be answered", async () => {
    const { turn } = await chat("Check my loan");

    const { response } = await chat("Never mind that, just check it", turn.conversationId);

    expect(response.status).toBe(409);
    expect((await answer(turn, PASSWORD_STEP_UP)).turn.pause?.kind).toBe("consent");
  });

  it("FR-WEB-03: answering a card while a turn is still running → 409", async () => {
    const { turn } = await chat("Check my loan");
    routes.deps.turnLock.acquire(turn.conversationId);

    const { response } = await answer(turn, PASSWORD_STEP_UP);

    expect(response.status).toBe(409);
  });
});
