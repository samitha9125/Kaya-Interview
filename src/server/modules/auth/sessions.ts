import { and, eq, isNull } from "drizzle-orm";
import type { AuditLog } from "@/server/platform/audit";
import type { Clock } from "@/server/platform/clock";
import { generateToken, hashToken } from "@/server/platform/crypto";
import type { AppDatabase } from "@/server/platform/db";
import type { IdGenerator } from "@/server/platform/ids";
import { SESSION_POLICY, STEP_UP_VALID_MS } from "./config";
import { findCustomerById } from "./customers";
import { checkPassword } from "./password-check";
import { isSessionActive, isStepUpFresh } from "./session-policy";
import { sessions } from "./schema";

export type SessionDeps = { db: AppDatabase; audit: AuditLog; clock: Clock; ids: IdGenerator };

export type Session = { id: string; customerId: string | null; stepUpAt: Date | null };

export type SessionResult =
  { ok: true; session: Session } | { ok: false; reason: "invalid" | "expired" };

export type StepUpRequest = {
  token: string;
  password: string;
  correlationId: string;
  conversationId?: string;
};

export type StepUpResult =
  { ok: true; token: string } | { ok: false; reason: "invalid_credentials" | "not_signed_in" };

// A new session, and so a new token, at every sign-in: a token issued
// before the customer proved who they are never gains their identity.
export function startSession(
  { customerId, correlationId }: { customerId: string | null; correlationId: string },
  deps: SessionDeps,
): { token: string; session: Session } {
  const token = generateToken();
  const now = deps.clock.now();
  const session: Session = { id: deps.ids.newId(), customerId, stepUpAt: null };
  deps.db
    .insert(sessions)
    .values({ ...session, tokenHash: hashToken(token), createdAt: now, lastSeenAt: now })
    .run();
  deps.audit.record(deps.db, {
    type: customerId ? "auth.session_started" : "auth.guest_session_started",
    correlationId,
    actor: customerId ?? `guest:${session.id}`,
  });
  return { token, session };
}

// Each request found with a token moves the idle clock on.
export function resolveSession(token: string, deps: SessionDeps): SessionResult {
  const row = findLiveRow(deps.db, token);
  if (!row) return { ok: false, reason: "invalid" };
  const now = deps.clock.now();
  if (!isSessionActive(row, now, SESSION_POLICY)) return { ok: false, reason: "expired" };
  deps.db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, row.id)).run();
  return { ok: true, session: { id: row.id, customerId: row.customerId, stepUpAt: row.stepUpAt } };
}

// FR-AUTH-04: revoked on the server, so a copied cookie stops working
// at once.
export function endSession(token: string, correlationId: string, deps: SessionDeps): void {
  const row = findLiveRow(deps.db, token);
  if (!row) return;
  deps.db
    .update(sessions)
    .set({ revokedAt: deps.clock.now() })
    .where(eq(sessions.id, row.id))
    .run();
  deps.audit.record(deps.db, {
    type: "auth.session_ended",
    correlationId,
    actor: row.customerId ?? `guest:${row.id}`,
  });
}

// BR-AUTH-03: re-entering the password rotates the token, so a token
// copied before the step-up can't use it.
export async function stepUp(request: StepUpRequest, deps: SessionDeps): Promise<StepUpResult> {
  const resolved = resolveSession(request.token, deps);
  if (!resolved.ok || !resolved.session.customerId) return { ok: false, reason: "not_signed_in" };
  const customer = findCustomerById(deps.db, resolved.session.customerId);
  if (!customer) return { ok: false, reason: "not_signed_in" };
  const context = {
    kind: "step_up" as const,
    correlationId: request.correlationId,
    conversationId: request.conversationId,
  };
  const result = await checkPassword(customer, request.password, context, deps);
  if (result !== "accepted") return { ok: false, reason: "invalid_credentials" };
  const token = generateToken();
  deps.db
    .update(sessions)
    .set({ tokenHash: hashToken(token), stepUpAt: deps.clock.now() })
    .where(eq(sessions.id, resolved.session.id))
    .run();
  return { ok: true, token };
}

export function hasFreshStepUp(session: Session, now: Date): boolean {
  return isStepUpFresh(session.stepUpAt, now, STEP_UP_VALID_MS);
}

function findLiveRow(db: AppDatabase, token: string) {
  return db
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, hashToken(token)), isNull(sessions.revokedAt)))
    .get();
}
