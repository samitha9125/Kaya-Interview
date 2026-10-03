import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const idempotencyKeys = sqliteTable(
  "idempotency_keys",
  {
    scope: text("scope").notNull(),
    key: text("key").notNull(),
    result: text("result", { mode: "json" }).$type<unknown>().notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.scope, table.key] })],
);
