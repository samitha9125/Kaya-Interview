import { asc, eq } from "drizzle-orm";
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
