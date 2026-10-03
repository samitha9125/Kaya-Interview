import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// The conversation ID is also the checkpointer's thread ID. A signed-in
// customer owns their conversations across sessions; a guest's belong to
// the one guest session that started them (FR-AUTH-06).
export const conversations = sqliteTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id"),
    guestSessionId: text("guest_session_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("conversations_customer_idx").on(table.customerId),
    index("conversations_guest_session_idx").on(table.guestSessionId),
  ],
);
