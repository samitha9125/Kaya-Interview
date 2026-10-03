import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Operator settings as key/value rows, e.g. "model.loan". A missing row
// means the default applies.
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
