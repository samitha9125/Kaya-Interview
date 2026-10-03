import { beforeEach, describe, expect, it } from "vitest";
import { createCustomer, resolveSession } from "@/server/modules/auth";
import { createAuditLog } from "@/server/platform/audit";
import { createIdempotency } from "@/server/platform/idempotency";
import { createLogger } from "@/server/platform/logger";
import { createRateLimiter } from "@/server/platform/rate-limit";
import { aCustomer, CUSTOMER_PASSWORD } from "@/test/builders/customer";
import { createTestDatabase } from "@/test/database";
import { fixedClock, sequentialIds, TEST_ENCRYPTION_KEY } from "@/test/fakes";
import { postGuest, postLogin, postLogout, type AuthRouteDeps } from "./auth-routes";

let deps: AuthRouteDeps;
let keys = 0;
const newKey = () => `00000000-0000-4000-8000-${String(++keys).padStart(12, "0")}`;
const customer = aCustomer({ id: "customer-a", customerNumber: "C1001" });

beforeEach(() => {
  const { db } = createTestDatabase();
  const clock = fixedClock();
  deps = {
    db,
    clock,
    ids: sequentialIds("id"),
    audit: createAuditLog({ clock, ids: sequentialIds("audit") }),
    idempotency: createIdempotency({ db, clock }),
    logger: createLogger({ write: () => {} }),
    loginLimiter: createRateLimiter({ limit: 10, windowMs: 60_000, clock }),
  };
  createCustomer(db, customer, TEST_ENCRYPTION_KEY);
});

function post(body: Record<string, unknown>, token?: string) {
  const headers = new Headers({ origin: "http://localhost:3000", host: "localhost:3000" });
  if (token) headers.set("cookie", `__Host-session=${token}`);
  return new Request("http://localhost:3000/api/auth", {
    method: "POST",
    headers,
    body: JSON.stringify({ ...body, idempotencyKey: newKey() }),
  });
}

function tokenFrom(response: Response): string {
  return /__Host-session=([^;]*)/.exec(response.headers.get("set-cookie") ?? "")?.[1] ?? "";
}

const signIn = (password = CUSTOMER_PASSWORD, customerNumber = "C1001", token?: string) =>
  postLogin(post({ customerNumber, password }, token), deps);

describe("harness/auth-routes: sign in", () => {
  it("FR-AUTH-02: a successful sign-in sets the __Host- session cookie with its flags", async () => {
    const response = await signIn();

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(
      /^__Host-session=[\w-]{43}; Path=\/; HttpOnly; Secure; SameSite=Strict$/,
    );
  });

  it("FR-AUTH-01: an unknown number and a wrong password get the same status and body", async () => {
    const unknown = await signIn(CUSTOMER_PASSWORD, "C9999");
    const wrong = await signIn("not the password");

    const [unknownBody, wrongBody] = await Promise.all([unknown.json(), wrong.json()]);
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect({ ...wrongBody.error, reference: "" }).toEqual({ ...unknownBody.error, reference: "" });
    expect(wrong.headers.get("set-cookie")).toBeNull();
  });

  it("FR-AUTH-03: signing in revokes the session the browser had before, such as a guest's", async () => {
    const guestToken = tokenFrom(await postGuest(post({}), deps));

    await signIn(CUSTOMER_PASSWORD, "C1001", guestToken);

    expect(resolveSession(guestToken, deps)).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("harness/auth-routes: sign out and guests", () => {
  it("FR-AUTH-04: after sign-out the copied cookie is refused at once", async () => {
    const token = tokenFrom(await signIn());

    const response = await postLogout(post({}, token), deps);

    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(resolveSession(token, deps)).toEqual({ ok: false, reason: "invalid" });
  });

  it('FR-AUTH-05: "I\'m new" starts a guest session with no customer', async () => {
    const token = tokenFrom(await postGuest(post({}), deps));

    expect(resolveSession(token, deps)).toMatchObject({ ok: true, session: { customerId: null } });
  });
});
