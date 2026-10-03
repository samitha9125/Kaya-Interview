import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// FR-AGT-14, B12: a request for a call from the bank's team. A customer is
// called on the number in their record; a guest's name and number are
// stored encrypted (FR-PLAT-02). One per conversation and reason.
export const callbackRequests = sqliteTable(
  "callback_requests",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").notNull(),
    reason: text("reason", { enum: ["loan", "kyc", "general"] }).notNull(),
    customerId: text("customer_id"),
    contactEncrypted: text("contact_encrypted"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("callback_requests_conversation_reason_idx").on(table.conversationId, table.reason),
  ],
);
