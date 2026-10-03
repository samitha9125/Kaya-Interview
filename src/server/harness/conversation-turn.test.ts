import { beforeEach, describe, expect, it } from "vitest";
import { startConversation, type ConversationDeps } from "@/server/agent/conversations/ownership";
import type { Session } from "@/server/modules/auth";
import { createTestDatabase } from "@/test/database";
import { fixedClock, sequentialIds } from "@/test/fakes";
import { withConversationTurn } from "./conversation-turn";
import { createTurnLock, type TurnLock } from "./turn-lock";

const owner: Session = { id: "session-a", customerId: "customer-a", stepUpAt: null };
const stranger: Session = { id: "session-b", customerId: "customer-b", stepUpAt: null };

let deps: ConversationDeps & { turnLock: TurnLock };
let conversationId: string;

beforeEach(() => {
  const { db } = createTestDatabase();
  deps = {
    db,
    clock: fixedClock(),
    ids: sequentialIds("conversation"),
    turnLock: createTurnLock(),
  };
  conversationId = startConversation(owner, deps);
});

const ok = async () => Response.json({ ok: true });
const turnFor = (session: Session, turn = ok) =>
  withConversationTurn({ conversationId, session, correlationId: "K7Q2XXXXXXXXXXXX" }, deps, turn);

// A turn that keeps running until the test lets it finish.
function heldTurn() {
  let finish = () => {};
  const done = new Promise<Response>((resolve) => {
    finish = () => resolve(Response.json({ ok: true }));
  });
  return { turn: () => done, finish };
}

describe("harness/conversation-turn: ownership and one turn at a time", () => {
  it("FR-AUTH-06: the owner's turn runs", async () => {
    expect((await turnFor(owner)).status).toBe(200);
  });

  it("P0-04: someone else's conversation → 404, the same as one that doesn't exist", async () => {
    const response = await turnFor(stranger);

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "not_found" } });
  });

  it("P1-15: a second message while a turn is running → 409", async () => {
    const first = heldTurn();
    const running = turnFor(owner, first.turn);

    const second = await turnFor(owner);
    first.finish();
    await running;

    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({ error: { code: "turn_in_progress" } });
  });

  it("FR-WEB-03: after a turn ends, even with an error, the next one may run", async () => {
    await turnFor(owner, () => Promise.reject(new Error("model down"))).catch(() => undefined);

    expect((await turnFor(owner)).status).toBe(200);
  });
});
