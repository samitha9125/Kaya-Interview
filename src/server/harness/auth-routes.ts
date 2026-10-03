import { endSession, login, startSession } from "@/server/modules/auth";
import { z } from "zod";
import { failureResponse } from "./failures";
import { clearedSessionCookie, sessionCookie } from "./http/session-cookie";
import { handleRoute, type HarnessDeps } from "./pipeline";
import type { RateLimiter } from "@/server/platform/rate-limit";

export type AuthRouteDeps = HarnessDeps & { loginLimiter: RateLimiter };

const LoginBody = z.strictObject({
  customerNumber: z.string().trim().min(1, { error: "Please enter your customer number." }).max(20),
  password: z.string().min(1, { error: "Please enter your password." }).max(200),
  idempotencyKey: z.uuid(),
});

const EmptyBody = z.strictObject({ idempotencyKey: z.uuid() });

const withCookie = (cookie: string) =>
  Response.json({ ok: true }, { headers: { "Set-Cookie": cookie } });

// FR-AUTH-01/03: a new session at every sign-in, and any session the
// browser already had (a guest's) is revoked, so no token issued before
// the password was checked carries the customer's identity.
export function postLogin(request: Request, deps: AuthRouteDeps): Promise<Response> {
  const options = {
    scope: "auth.login",
    body: LoginBody,
    session: "optional" as const,
    typedFields: ["customerNumber", "password"],
  };
  return handleRoute(request, options, deps, async ({ body, ip, token, correlationId }) => {
    const result = await login(
      { customerNumber: body.customerNumber, password: body.password, ip, correlationId },
      deps,
    );
    if (!result.ok) {
      const kind = result.reason === "too_many_attempts" ? "sign_in_paused" : "sign_in_failed";
      return failureResponse(kind, correlationId);
    }
    if (token) endSession(token, correlationId, deps);
    const session = startSession({ customerId: result.customerId, correlationId }, deps);
    return withCookie(sessionCookie(session.token));
  });
}

// FR-AUTH-04: revoked on the server first, so a copy of the cookie dies too.
export function postLogout(request: Request, deps: AuthRouteDeps): Promise<Response> {
  const options = { scope: "auth.logout", body: EmptyBody, session: "optional" as const };
  return handleRoute(request, options, deps, async ({ token, correlationId }) => {
    if (token) endSession(token, correlationId, deps);
    return withCookie(clearedSessionCookie());
  });
}

// FR-AUTH-05: "I'm new" starts a guest session with no customer.
export function postGuest(request: Request, deps: AuthRouteDeps): Promise<Response> {
  const options = { scope: "auth.guest", body: EmptyBody, session: "optional" as const };
  return handleRoute(request, options, deps, async ({ token, correlationId }) => {
    if (token) endSession(token, correlationId, deps);
    const session = startSession({ customerId: null, correlationId }, deps);
    return withCookie(sessionCookie(session.token));
  });
}
