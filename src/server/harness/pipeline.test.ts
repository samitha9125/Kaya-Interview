import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCustomer, startSession } from "@/server/modules/auth";
import { createAuditLog } from "@/server/platform/audit";
import { createIdempotency } from "@/server/platform/idempotency";
import { createLogger } from "@/server/platform/logger";
import { createRateLimiter } from "@/server/platform/rate-limit";
import { aCustomer } from "@/test/builders/customer";
import { createTestDatabase } from "@/test/database";
import { movableClock, sequentialIds, TEST_ENCRYPTION_KEY } from "@/test/fakes";
import { ChatMessageBody } from "./chat-input";
import { handleRoute, type HarnessDeps, type RouteOptions } from "./pipeline";

const ORIGIN = "http://localhost:3000";
const MINUTE = 60_000;
let keyCounter = 0;
const newKey = () => `00000000-0000-4000-8000-${String(++keyCounter).padStart(12, "0")}`;

let deps: HarnessDeps;
let logLines: string[];
let advance: (ms: number) => void;
let token: string;
const handler = vi.fn(async () => Response.json({ ok: true }));
const options: RouteOptions<ChatMessageBody> = {
  scope: "test.chat",
  body: ChatMessageBody,
  session: "required",
  typedFields: ["message"],
};

beforeEach(() => {
  handler.mockClear();
  const { db } = createTestDatabase();
  const time = movableClock();
  advance = time.advance;
  logLines = [];
  deps = {
    db,
    clock: time.clock,
    ids: sequentialIds("id"),
    audit: createAuditLog({ clock: time.clock, ids: sequentialIds("audit") }),
    idempotency: createIdempotency({ db, clock: time.clock }),
    logger: createLogger({ write: (line) => logLines.push(line), now: time.clock.now }),
  };
  createCustomer(db, aCustomer({ id: "customer-a" }), TEST_ENCRYPTION_KEY);
  token = startSession({ customerId: "customer-a", correlationId: "c" }, deps).token;
});

type Overrides = { origin?: string | null; cookie?: string | null; body?: unknown };

function post({ origin = ORIGIN, cookie = `__Host-session=${token}`, body }: Overrides = {}) {
  const headers = new Headers({ host: "localhost:3000", "x-forwarded-for": "203.0.113.7" });
  if (origin) headers.set("origin", origin);
  if (cookie) headers.set("cookie", cookie);
  const json = body ?? { message: "hello", idempotencyKey: newKey() };
  return new Request(`${ORIGIN}/api/chat`, { method: "POST", headers, body: JSON.stringify(json) });
}

const run = (request: Request, routeOptions = options) =>
  handleRoute(request, routeOptions, deps, handler);

async function errorOf(response: Response) {
  const { error } = (await response.json()) as {
    error: { code: string; message: string; reference: string };
  };
  return { status: response.status, ...error };
}

describe("harness/pipeline: checks before a handler runs (FR-WEB-01)", () => {
  it("FR-WEB-01: a valid request reaches the handler with the session and parsed body", async () => {
    const response = await run(post({ body: { message: "  hello  ", idempotencyKey: newKey() } }));

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        session: expect.objectContaining({ customerId: "customer-a" }),
        body: expect.objectContaining({ message: "hello" }),
      }),
    );
  });

  it.each([
    { case: "a foreign Origin", origin: "https://evil.example" },
    { case: "no Origin", origin: null },
  ])("FR-WEB-01: $case → 403 and the handler never runs", async ({ origin }) => {
    const response = await run(post({ origin }));

    expect(await errorOf(response)).toMatchObject({ status: 403, code: "forbidden" });
    expect(handler).not.toHaveBeenCalled();
  });

  it.each([
    { case: "no session cookie", cookie: null },
    { case: "an invented token", cookie: "__Host-session=not-a-token" },
  ])("FR-WEB-01: $case → 401 not signed in", async ({ cookie }) => {
    expect(await errorOf(await run(post({ cookie })))).toMatchObject({
      status: 401,
      code: "not_signed_in",
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("FR-AUTH-03: an expired session → 401 with the signed-out message", async () => {
    advance(15 * MINUTE);

    expect(await errorOf(await run(post()))).toMatchObject({
      status: 401,
      code: "session_expired",
    });
  });

  it("FR-WEB-01: an optional-session route runs without a session", async () => {
    await run(post({ cookie: null }), { ...options, session: "optional" });

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ session: null }));
  });
});

describe("harness/pipeline: body and idempotency", () => {
  it("FR-WEB-02: a 1,001-character message → 400 with the human message", async () => {
    const body = { message: "a".repeat(1_001), idempotencyKey: newKey() };

    expect(await errorOf(await run(post({ body })))).toMatchObject({
      status: 400,
      message: "Please keep your message under 1,000 characters.",
    });
  });

  it("FR-WEB-01: a malformed field nobody typed gets the generic template, not zod's text", async () => {
    const body = { message: "hi", idempotencyKey: "not-a-uuid" };

    expect(await errorOf(await run(post({ body })))).toMatchObject({
      status: 400,
      message: "Something in that request wasn't right. Please try again.",
    });
  });

  it("FR-WEB-01: a replayed idempotency key → 409 and the handler runs once", async () => {
    const body = { message: "hello", idempotencyKey: newKey() };
    await run(post({ body }));

    const replay = await run(post({ body }));

    expect(await errorOf(replay)).toMatchObject({ status: 409, code: "duplicate_request" });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe("harness/pipeline: rate limit (FR-WEB-02)", () => {
  it("P1-12: the 21st chat request in a minute from one IP → 429 slow down", async () => {
    const limited = {
      ...options,
      rateLimiter: createRateLimiter({ limit: 20, windowMs: MINUTE, clock: deps.clock }),
    };
    await Promise.all(Array.from({ length: 20 }, () => run(post(), limited)));

    const response = await run(post(), limited);

    expect(await errorOf(response)).toMatchObject({ status: 429, code: "too_many_requests" });
    expect(handler).toHaveBeenCalledTimes(20);
  });
});

describe("harness/pipeline: failures (FR-WEB-05)", () => {
  it("FR-WEB-05: an unexpected error → the template and a reference, never the raw error", async () => {
    handler.mockRejectedValueOnce(new Error("SQLITE_CORRUPT at /var/db/bank.db"));

    const failure = await errorOf(await run(post()));

    expect(failure).toMatchObject({ status: 500, code: "internal" });
    expect(failure.message).toBe(
      `Something went wrong on our side. Reference: ${failure.reference}. You can give this to our support team if they ask.`,
    );
    expect(failure.message).not.toContain("SQLITE");
  });

  it("FR-WEB-05: the full error is logged under the correlation ID whose prefix is the reference", async () => {
    handler.mockRejectedValueOnce(new Error("SQLITE_CORRUPT"));

    const { reference } = await errorOf(await run(post()));

    const logged = JSON.parse(logLines.at(-1) ?? "{}") as {
      correlationId: string;
      error: { message: string };
    };
    expect(logged.correlationId.startsWith(reference)).toBe(true);
    expect(logged.error.message).toBe("SQLITE_CORRUPT");
  });
});
