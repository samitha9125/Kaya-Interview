import type { RateLimiter } from "@/server/platform/rate-limit";
import { findCustomerByNumber } from "./customers";
import { checkPassword, verifyAgainstNobody, type PasswordCheckDeps } from "./password-check";

export type AuthDeps = PasswordCheckDeps & { loginLimiter: RateLimiter };

export type LoginRequest = {
  customerNumber: string;
  password: string;
  ip: string;
  correlationId: string;
};

// One failure answer for an unknown customer, a wrong password and a locked
// account (FR-AUTH-01), so sign-in never confirms that a number exists.
// The real reason is in the audit trail.
export type LoginResult =
  | { ok: true; customerId: string }
  | { ok: false; reason: "invalid_credentials" | "too_many_attempts" };

const INVALID: LoginResult = { ok: false, reason: "invalid_credentials" };

export async function login(request: LoginRequest, deps: AuthDeps): Promise<LoginResult> {
  if (!deps.loginLimiter.take(request.ip)) {
    deps.audit.record(deps.db, {
      type: "auth.login_rate_limited",
      correlationId: request.correlationId,
      actor: "anonymous",
      payload: { ip: request.ip },
    });
    return { ok: false, reason: "too_many_attempts" };
  }
  const customer = findCustomerByNumber(deps.db, request.customerNumber);
  if (!customer) {
    await verifyAgainstNobody(request.password);
    deps.audit.record(deps.db, {
      type: "auth.login_refused",
      correlationId: request.correlationId,
      actor: "anonymous",
      payload: { reason: "unknown_customer", customerNumber: request.customerNumber },
    });
    return INVALID;
  }
  const context = { kind: "login" as const, correlationId: request.correlationId };
  const result = await checkPassword(customer, request.password, context, deps);
  return result === "accepted" ? { ok: true, customerId: customer.id } : INVALID;
}
