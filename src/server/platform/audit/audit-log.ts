import { and, asc, desc, eq, gte, inArray, like, or } from "drizzle-orm";
import type { Clock } from "../clock";
import type { DbExecutor } from "../db";
import type { IdGenerator } from "../ids";
import { redact } from "../logger";
import { auditEvents } from "./schema";

export type AuditEvent = {
  type: string;
  correlationId: string;
  actor: string;
  conversationId?: string;
  payload?: Record<string, unknown>;
  model?: string;
  promptVersion?: string;
};

export type AuditRecord = typeof auditEvents.$inferSelect;

// Only record and read: there is deliberately no update or delete.
export type AuditLog = { record: (executor: DbExecutor, event: AuditEvent) => void };

export function createAuditLog({ clock, ids }: { clock: Clock; ids: IdGenerator }): AuditLog {
  return {
    record(executor, event) {
      executor
        .insert(auditEvents)
        .values({
          id: ids.newId(),
          at: clock.now(),
          correlationId: event.correlationId,
          conversationId: event.conversationId ?? null,
          actor: event.actor,
          type: event.type,
          payload: redact(event.payload ?? {}),
          model: event.model ?? null,
          promptVersion: event.promptVersion ?? null,
        })
        .run();
    },
  };
}

export function findAuditEvents(executor: DbExecutor, correlationId: string): AuditRecord[] {
  return executor
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.correlationId, correlationId))
    .orderBy(asc(auditEvents.at))
    .all();
}

// A conversation's own events, and those of the same requests that carry
// no conversation (sign-in, step-up).
export function findConversationEvents(
  executor: DbExecutor,
  conversationId: string,
): AuditRecord[] {
  const requestsOfConversation = executor
    .selectDistinct({ id: auditEvents.correlationId })
    .from(auditEvents)
    .where(eq(auditEvents.conversationId, conversationId));
  return executor
    .select()
    .from(auditEvents)
    .where(
      or(
        eq(auditEvents.conversationId, conversationId),
        inArray(auditEvents.correlationId, requestsOfConversation),
      ),
    )
    .orderBy(asc(auditEvents.at))
    .all();
}

export function findEventsSince(
  executor: DbExecutor,
  typePrefix: string,
  since: Date,
): AuditRecord[] {
  return executor
    .select()
    .from(auditEvents)
    .where(and(like(auditEvents.type, `${typePrefix}%`), gte(auditEvents.at, since)))
    .orderBy(asc(auditEvents.at))
    .all();
}

export function findLatestEvent(executor: DbExecutor, type: string): AuditRecord | undefined {
  return executor
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.type, type))
    .orderBy(desc(auditEvents.at))
    .get();
}
