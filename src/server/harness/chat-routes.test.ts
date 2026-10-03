import { fakeModel } from "langchain";
import { beforeEach, describe, expect, it } from "vitest";
import { createCheckpointer } from "@/server/agent/checkpointer";
import { createCustomer, isStepUpFreshFor, startSession } from "@/server/modules/auth";
import type { LendingDeps } from "@/server/modules/lending";
import { createAuditLog } from "@/server/platform/audit";
import type { DatabaseHandle } from "@/server/platform/db";
import { createIdempotency } from "@/server/platform/idempotency";
import { createLogger } from "@/server/platform/logger";
import { createRateLimiter } from "@/server/platform/rate-limit";
import { aCustomer, CUSTOMER_PASSWORD } from "@/test/builders/customer";
import { CUSTOMER_NIC } from "@/test/credit-setup";
import { createTestDatabase } from "@/test/database";
import { readEvents } from "@/test/sse";
import { aScore, scriptedBureau } from "@/test/fake-bureau";
import { movableClock, sequentialIds, TEST_ENCRYPTION_KEY } from "@/test/fakes";
import { ASSESSMENT_CALL, buildTestGraph } from "@/test/graph";
import { GOOD_RECORD, TERMS } from "@/test/lending-setup";
import { postChatMessage, postResume, type ChatRouteDeps } from "./chat-routes";
import { createTurnLock } from "./turn-lock";

type Turn = {
  conversationId: string;
  messages: { text: string }[];
  pause: { interruptId: string; kind: string } | null;
};

let handle: DatabaseHandle;
let deps: ChatRouteDeps;
let token: string;
let keys = 0;
const newKey = () => `00000000-0000-4000-8000-${String(++keys).padStart(12, "0")}`;

// Everything real on one in-memory SQLite: sessions, lending, and the
// graph's checkpoints. Only the model and the bureau are scripted.
beforeEach(() => {
  handle = createTestDatabase();
  const { db, sqlite } = handle;
  const { clock } = movableClock();
  const audit = createAuditLog({ clock, ids: sequentialIds("audit") });
  const ids = sequentialIds("id");
  const lending: LendingDeps = {
    db,
    audit,
    clock,
    ids,
    thresholdBp: 9_500,
    loadBankRecord: () => GOOD_RECORD,
    credit: {
      db,
      audit,
      clock,
      cacheTtlDays: 30,
      random: () => 0.5,
      sleep: async () => {},
      bureau: scriptedBureau([aScore(800)]).bureau,
      loadNic: () => CUSTOMER_NIC,
    },
  };
  const graph = buildTestGraph(
    fakeModel().respondWithTools([ASSESSMENT_CALL]).respondWithTools([ASSESSMENT_CALL]),
    {
      lending,
      isStepUpFresh: (sessionId) => isStepUpFreshFor(sessionId, { db, clock }),
      checkpointer: createCheckpointer(sqlite),
    },
  );
  deps = {
    db,
    clock,
    ids,
    audit,
    graph,
    idempotency: createIdempotency({ db, clock }),
    logger: createLogger({ write: () => {} }),
    turnLock: createTurnLock(),
    chatLimiter: createRateLimiter({ limit: 100, windowMs: 60_000, clock }),
  };
  createCustomer(db, aCustomer({ id: "customer-a" }), TEST_ENCRYPTION_KEY);
  token = startSession({ customerId: "customer-a", correlationId: "c" }, deps).token;
});

function post(body: Record<string, unknown>) {
  const headers = new Headers({ origin: "http://localhost:3000", host: "localhost:3000" });
  headers.set("cookie", `__Host-session=${token}`);
  return new Request("http://localhost:3000/api/chat", {
    method: "POST",
    headers,
    body: JSON.stringify({ idempotencyKey: newKey(), ...body }),
  });
}

// The streamed turn, gathered into what the customer ends up seeing.
async function turnOf(response: Response): Promise<Turn> {
  if (!response.ok) return { conversationId: "", messages: [], pause: null };
  const events = await readEvents(response.clone());
  const done = events.find((event) => event.type === "done");
  const pause = events.find((event) => event.type === "interrupt");
  return {
    conversationId: String(done?.data.conversationId),
    messages: events
      .filter((event) => event.type === "message")
      .map((event) => ({ text: String(event.data.text) })),
    pause: pause ? (pause.data as Turn["pause"]) : null,
  };
}

async function chat(message: string, conversationId?: string) {
  const response = await postChatMessage(post({ message, conversationId }), deps);
  return { response, turn: await turnOf(response) };
}

async function answer(turn: Turn, reply: Record<string, unknown>) {
  const body = { conversationId: turn.conversationId, interruptId: turn.pause?.interruptId };
  const response = await postResume(post({ ...body, answer: reply }), deps);
  const setCookie = /__Host-session=([^;]*)/.exec(response.headers.get("set-cookie") ?? "");
  if (setCookie?.[1]) token = setCookie[1];
  return { response, turn: await turnOf(response) };
}

// Every row of every table as text: what a reader of the database file
// would see.
function everythingStored(): string {
  const tables = handle.sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .pluck()
    .all() as string[];
  return tables
    .flatMap((table) => handle.sqlite.prepare(`SELECT * FROM "${table}"`).all())
    .map((row) =>
      Object.values(row as object)
        .map((value) => String(value))
        .join("|"),
    )
    .join("\n");
}

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

    const failures = handle.sqlite
      .prepare("SELECT failed_login_count FROM customers WHERE id = 'customer-a'")
      .pluck()
      .get();
    expect(response.status).toBe(401);
    expect(failures).toBe(1);
    expect((await chat("Hello?", turn.conversationId)).response.status).toBe(409);
  });

  it("BR-AUTH-03: the right password rotates the session cookie and moves on to consent", async () => {
    const { turn } = await chat("Check my loan");
    const before = token;

    const next = await answer(turn, PASSWORD_STEP_UP);

    expect(next.response.status).toBe(200);
    expect(token).not.toBe(before);
    expect(next.turn.pause).toMatchObject({ kind: "consent", ...TERMS });
  });

  it("P0-19: after a whole journey, the password is nowhere in the database, checkpoints included", async () => {
    const { turn } = await chat("Check my loan");
    const consent = await answer(turn, PASSWORD_STEP_UP);
    const confirm = await answer(consent.turn, { kind: "consent", agree: true });

    await answer(confirm.turn, { kind: "confirm", confirm: true });

    const stored = everythingStored();
    expect(stored).toContain("loan.applied");
    expect(stored).not.toContain(CUSTOMER_PASSWORD);
  });
});

describe("harness/chat-routes: consent and answers belong to their card (FR-AGT-06)", () => {
  it("BR-LEND-07: agreeing records consent for the terms on the card", async () => {
    const { turn } = await chat("Check my loan");
    const consent = await answer(turn, PASSWORD_STEP_UP);

    const next = await answer(consent.turn, { kind: "consent", agree: true });

    const row = handle.sqlite.prepare("SELECT amount_lkr, term_months FROM consents").get();
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
    expect(handle.sqlite.prepare("SELECT count(*) FROM consents").pluck().get()).toBe(0);
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
