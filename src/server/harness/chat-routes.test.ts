import { fakeModel } from "langchain";
import { beforeEach, describe, expect, it } from "vitest";
import { CUSTOMER_PASSWORD } from "@/test/builders/customer";
import { chatRouteSetup, type Turn } from "@/test/chat-routes";
import { everythingStored } from "@/test/database";
import { ASSESSMENT_CALL } from "@/test/graph";
import { TERMS } from "@/test/lending-setup";

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

describe("harness/chat-routes: a pending card (FR-WEB-03)", () => {
  it("P1-15: a chat message while a card is waiting → 409, and the card is kept", async () => {
    const { turn } = await chat("Check my loan");

    const { response } = await chat("Just tell me now", turn.conversationId);

    const again = await chat("Hello?", turn.conversationId);
    expect(turn.pause?.kind).toBe("step_up");
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("pause_pending");
    expect(again.response.status).toBe(409);
  });
});

describe("harness/chat-routes: step-up through its card (BR-AUTH-03)", () => {
  it("BR-AUTH-02: a wrong password → 401, the card stays, and the failure counts toward lockout", async () => {
    const { turn } = await chat("Check my loan");

    const { response } = await answer(turn, { kind: "step_up", password: "not it" });

    const failures = routes.handle.sqlite
      .prepare("SELECT failed_login_count FROM customers WHERE id = 'customer-a'")
      .pluck()
      .get();
    expect(response.status).toBe(401);
    expect(failures).toBe(1);
    expect((await chat("Hello?", turn.conversationId)).response.status).toBe(409);
  });

  it("BR-AUTH-03: the right password rotates the session cookie and moves on to consent", async () => {
    const { turn } = await chat("Check my loan");
    const before = routes.token();

    const next = await answer(turn, PASSWORD_STEP_UP);

    expect(next.response.status).toBe(200);
    expect(routes.token()).not.toBe(before);
    expect(next.turn.pause).toMatchObject({ kind: "consent", ...TERMS });
  });

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

describe("harness/chat-routes: consent and answers belong to their card (FR-AGT-06)", () => {
  it("BR-LEND-07: agreeing records consent for the terms on the card", async () => {
    const { turn } = await chat("Check my loan");
    const consent = await answer(turn, PASSWORD_STEP_UP);

    const next = await answer(consent.turn, { kind: "consent", agree: true });

    const row = routes.handle.sqlite.prepare("SELECT amount_lkr, term_months FROM consents").get();
    expect(row).toEqual({ amount_lkr: TERMS.amountLkr, term_months: TERMS.termMonths });
    expect(next.turn.pause?.kind).toBe("confirm");
  });

  it("P0-12: an answer carrying its own amount is refused before anything is recorded", async () => {
    const { turn } = await chat("Check my loan");
    const consent = await answer(turn, PASSWORD_STEP_UP);

    const { response } = await answer(consent.turn, {
      kind: "consent",
      agree: true,
      amountLkr: 3_000_000,
    });

    expect(response.status).toBe(400);
    expect(routes.handle.sqlite.prepare("SELECT count(*) FROM consents").pluck().get()).toBe(0);
  });

  it("FR-AGT-06: an answer for a different card, or an old card, → 409 and nothing changes", async () => {
    const { turn } = await chat("Check my loan");
    const wrongKind = await answer(turn, { kind: "consent", agree: true });
    const consent = await answer(turn, PASSWORD_STEP_UP);

    const replayed = await answer(turn, PASSWORD_STEP_UP);

    expect(wrongKind.response.status).toBe(409);
    expect(replayed.response.status).toBe(409);
    expect(consent.turn.pause?.kind).toBe("consent");
  });
});
