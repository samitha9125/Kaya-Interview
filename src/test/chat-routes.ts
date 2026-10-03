import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { createCheckpointer } from "@/server/agent/checkpointer";
import { createCustomer, isStepUpFreshFor, startSession } from "@/server/modules/auth";
import type { LendingDeps } from "@/server/modules/lending";
import { createAuditLog } from "@/server/platform/audit";
import { createIdempotency } from "@/server/platform/idempotency";
import { createLogger } from "@/server/platform/logger";
import { createRateLimiter } from "@/server/platform/rate-limit";
import { postChatMessage, postResume, type ChatRouteDeps } from "@/server/harness/chat-routes";
import { createTurnLock } from "@/server/harness/turn-lock";
import { aCustomer } from "@/test/builders/customer";
import { CUSTOMER_NIC } from "@/test/credit-setup";
import { createTestDatabase } from "@/test/database";
import { aScore, scriptedBureau } from "@/test/fake-bureau";
import { movableClock, sequentialIds, TEST_ENCRYPTION_KEY } from "@/test/fakes";
import { buildTestGraph, callbackTestDeps, onboardingTestDeps } from "@/test/graph";
import { GOOD_RECORD } from "@/test/lending-setup";
import { readEvents } from "@/test/sse";

export type Turn = {
  conversationId: string;
  messages: { text: string }[];
  pause: ({ interruptId: string; kind: string } & Record<string, unknown>) | null;
};

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
    pause: (pause?.data.pause as Turn["pause"] | undefined) ?? null,
  };
}

// The chat routes with everything real on one in-memory SQLite: sessions,
// lending, onboarding and the graph's checkpoints. Only the model and the
// bureau are scripted. Requests carry customer-a's session unless the test
// switches to a guest.
export function chatRouteSetup(model: BaseChatModel) {
  const handle = createTestDatabase();
  const { db, sqlite } = handle;
  const { clock } = movableClock();
  const audit = createAuditLog({ clock, ids: sequentialIds("audit") });
  const ids = sequentialIds("id");
  const lending: LendingDeps = {
    ...{ db, audit, clock, ids },
    thresholdBp: 9_500,
    loadBankRecord: () => GOOD_RECORD,
    credit: {
      ...{ db, audit, clock },
      cacheTtlDays: 30,
      random: () => 0.5,
      sleep: async () => {},
      bureau: scriptedBureau([aScore(800)]).bureau,
      loadNic: () => CUSTOMER_NIC,
    },
  };
  const onboarding = onboardingTestDeps(lending);
  const callbacks = callbackTestDeps(lending);
  const graph = buildTestGraph(model, {
    lending,
    onboarding,
    callbacks,
    isStepUpFresh: (sessionId) => isStepUpFreshFor(sessionId, { db, clock }),
    checkpointer: createCheckpointer(sqlite),
  });
  const deps: ChatRouteDeps = {
    ...{ db, clock, ids, audit, graph, onboarding, callbacks },
    idempotency: createIdempotency({ db, clock }),
    logger: createLogger({ write: () => {} }),
    turnLock: createTurnLock(),
    chatLimiter: createRateLimiter({ limit: 100, windowMs: 60_000, clock }),
  };
  createCustomer(db, aCustomer({ id: "customer-a" }), TEST_ENCRYPTION_KEY);
  let token = startSession({ customerId: "customer-a", correlationId: "c" }, deps).token;
  let keys = 0;
  const newKey = () => `00000000-0000-4000-8000-${String(++keys).padStart(12, "0")}`;

  function post(body: Record<string, unknown>) {
    const headers = new Headers({ origin: "http://localhost:3000", host: "localhost:3000" });
    headers.set("cookie", `__Host-session=${token}`);
    return new Request("http://localhost:3000/api/chat", {
      method: "POST",
      headers,
      body: JSON.stringify({ idempotencyKey: newKey(), ...body }),
    });
  }

  return {
    handle,
    deps,
    token: () => token,
    useGuestSession() {
      token = startSession({ customerId: null, correlationId: "c" }, deps).token;
    },
    async chat(message: string, extra: { conversationId?: string; starter?: string } = {}) {
      const response = await postChatMessage(post({ message, ...extra }), deps);
      return { response, turn: await turnOf(response) };
    },
    async answer(turn: Turn, reply: Record<string, unknown>) {
      const body = { conversationId: turn.conversationId, interruptId: turn.pause?.interruptId };
      const response = await postResume(post({ ...body, answer: reply }), deps);
      const setCookie = /__Host-session=([^;]*)/.exec(response.headers.get("set-cookie") ?? "");
      if (setCookie?.[1]) token = setCookie[1];
      return { response, turn: await turnOf(response) };
    },
  };
}
