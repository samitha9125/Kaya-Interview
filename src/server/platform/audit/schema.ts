import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Append-only: a migration adds triggers that refuse UPDATE and DELETE.
export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    at: integer("at", { mode: "timestamp_ms" }).notNull(),
    correlationId: text("correlation_id").notNull(),
    conversationId: text("conversation_id"),
    actor: text("actor").notNull(),
    type: text("type").notNull(),
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    model: text("model"),
    promptVersion: text("prompt_version"),
  },
  (table) => [
    index("audit_events_correlation_idx").on(table.correlationId),
    index("audit_events_conversation_idx").on(table.conversationId),
  ],
);
