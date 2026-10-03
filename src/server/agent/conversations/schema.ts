import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { ModelSelection } from "@/server/modules/settings";

// The conversation ID is also the checkpointer's thread ID. A signed-in
// customer owns their conversations across sessions; a guest's belong to
// the one guest session that started them (FR-AUTH-06). The models are
// fixed when it starts, so a Settings change applies to new conversations
// only (FR-SET-01).
export const conversations = sqliteTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id"),
    guestSessionId: text("guest_session_id"),
    models: text("models", { mode: "json" }).$type<ModelSelection>().notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("conversations_customer_idx").on(table.customerId),
    index("conversations_guest_session_idx").on(table.guestSessionId),
  ],
);
