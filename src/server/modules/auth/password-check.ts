import { eq } from "drizzle-orm";
import { writeWithAudit, type AuditLog } from "@/server/platform/audit";
import type { Clock } from "@/server/platform/clock";
import { hashPassword, verifyPassword } from "@/server/platform/crypto";
import type { AppDatabase } from "@/server/platform/db";
import { LOCKOUT_POLICY } from "./config";
import { findCustomerById, type CustomerRecord } from "./customers";
import { isLocked, registerFailure, registerSuccess, type LockoutState } from "./lockout";
import { customers } from "./schema";

export type PasswordCheckDeps = { db: AppDatabase; audit: AuditLog; clock: Clock };

export type PasswordCheckContext = {
  kind: "login" | "step_up";
  correlationId: string;
  conversationId?: string;
};

export type PasswordCheckResult = "accepted" | "wrong_password" | "locked";

// A real hash at full cost: an unknown customer number takes as long to
// refuse as a wrong password, so timing doesn't reveal which numbers exist.
let unknownCustomerHash: Promise<string> | undefined;

export function verifyAgainstNobody(password: string): Promise<boolean> {
  unknownCustomerHash ??= hashPassword("no customer has this password");
  return unknownCustomerHash.then((hash) => verifyPassword(password, hash));
}

// Shared by sign-in and step-up, so a failed step-up counts toward the
// same lockout (BR-AUTH-02). The password is checked before the lock, so
// a locked account answers in the same time as an open one.
export async function checkPassword(
  customer: CustomerRecord,
  password: string,
  context: PasswordCheckContext,
  deps: PasswordCheckDeps,
): Promise<PasswordCheckResult> {
  const matches = await verifyPassword(password, customer.passwordHash);
  return writeWithAudit(deps.db, deps.audit, (tx) => {
    const now = deps.clock.now();
    const current = findCustomerById(tx, customer.id) ?? customer;
    const state: LockoutState = {
      failedAttempts: current.failedLoginCount,
      lockedUntil: current.lockedUntil,
    };
    const result: PasswordCheckResult = isLocked(state, now)
      ? "locked"
      : matches
        ? "accepted"
        : "wrong_password";
    const next =
      result === "accepted" ? registerSuccess() : registerFailure(state, now, LOCKOUT_POLICY);
    tx.update(customers)
      .set({ failedLoginCount: next.failedAttempts, lockedUntil: next.lockedUntil })
      .where(eq(customers.id, customer.id))
      .run();
    return {
      result,
      event: {
        type:
          result === "accepted" ? `auth.${context.kind}_succeeded` : `auth.${context.kind}_refused`,
        correlationId: context.correlationId,
        conversationId: context.conversationId,
        actor: customer.id,
        payload:
          result === "accepted" ? {} : { reason: result, failedAttempts: next.failedAttempts },
      },
    };
  });
}
