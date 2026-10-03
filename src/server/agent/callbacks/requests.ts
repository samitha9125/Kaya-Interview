import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { MobileNumber } from "@/server/modules/onboarding";
import type { AuditLog } from "@/server/platform/audit";
import type { Clock } from "@/server/platform/clock";
import { encryptField } from "@/server/platform/crypto";
import { runInTransaction, type AppDatabase, type DbExecutor } from "@/server/platform/db";
import type { IdGenerator } from "@/server/platform/ids";
import { callbackRequests } from "./schema";

export type CallbackDeps = {
  db: AppDatabase;
  audit: AuditLog;
  clock: Clock;
  ids: IdGenerator;
  encryptionKey: Buffer;
};

// What the call is about: the journey the customer was on, if any.
export type CallbackReason = "loan" | "kyc" | "general";

const NAME_MESSAGE = "Please enter your name.";

// The guest callback card. The mobile rule is the account form's.
const CallbackContact = z.strictObject({
  name: z.string({ error: NAME_MESSAGE }).trim().min(2, NAME_MESSAGE).max(100, NAME_MESSAGE),
  mobileNumber: MobileNumber,
});
export type CallbackContact = z.infer<typeof CallbackContact>;

export type ContactResult =
  { ok: true; contact: CallbackContact } | { ok: false; errors: Partial<Record<string, string>> };

export function parseCallbackContact(input: unknown): ContactResult {
  const parsed = CallbackContact.safeParse(input);
  if (parsed.success) return { ok: true, contact: parsed.data };
  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues)
    errors[String(issue.path[0] ?? "form")] ??= issue.message;
  return { ok: false, errors };
}

export type CallbackRequest = {
  conversationId: string;
  correlationId: string;
  reason: CallbackReason;
  // A signed-in customer is called on their record's number; a guest
  // gives a name and number.
  caller: { customerId: string } | { guestSessionId: string; contact: CallbackContact };
};

export function findCallback(
  executor: DbExecutor,
  conversationId: string,
  reason: CallbackReason,
): string | undefined {
  return executor
    .select({ id: callbackRequests.id })
    .from(callbackRequests)
    .where(
      and(eq(callbackRequests.conversationId, conversationId), eq(callbackRequests.reason, reason)),
    )
    .get()?.id;
}

// FR-AGT-14: idempotent by conversation and reason, so asking twice, or a
// replayed step, finds the first request. The request and its audit
// record are written together.
export function requestCallback(request: CallbackRequest, deps: CallbackDeps): string {
  return runInTransaction(deps.db, (tx) => {
    const earlier = findCallback(tx, request.conversationId, request.reason);
    if (earlier) return earlier;
    const id = deps.ids.newId();
    const { caller } = request;
    const isCustomer = "customerId" in caller;
    tx.insert(callbackRequests)
      .values({
        id,
        conversationId: request.conversationId,
        reason: request.reason,
        customerId: isCustomer ? caller.customerId : null,
        contactEncrypted: isCustomer
          ? null
          : encryptField(JSON.stringify(caller.contact), deps.encryptionKey),
        createdAt: deps.clock.now(),
      })
      .run();
    deps.audit.record(tx, {
      type: "callback.requested",
      correlationId: request.correlationId,
      conversationId: request.conversationId,
      actor: isCustomer ? caller.customerId : `guest:${caller.guestSessionId}`,
      payload: { callbackId: id, reason: request.reason },
    });
    return id;
  });
}
