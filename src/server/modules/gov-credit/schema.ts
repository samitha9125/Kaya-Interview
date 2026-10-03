import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Keyed by our customer ID, never the NIC (TD7). A score is null when the
// bureau has no history for the person. scoreChanged records whether this
// fetch differed from the last one, so the 30-day lifetime can be re-tuned
// from data (FR-CRED-03, D6); null on a customer's first fetch.
export const creditScoreCache = sqliteTable("credit_score_cache", {
  customerId: text("customer_id").primaryKey(),
  score: integer("score"),
  hasHistory: integer("has_history", { mode: "boolean" }).notNull(),
  fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }).notNull(),
  scoreChanged: integer("score_changed", { mode: "boolean" }),
});

// One row for the bank: the whole bank shares the 5 calls a day (B6).
export const govApiBudget = sqliteTable("gov_api_budget", {
  id: integer("id").primaryKey(),
  day: text("day").notNull(),
  attempts: integer("attempts").notNull(),
  blockedUntil: integer("blocked_until", { mode: "timestamp_ms" }),
  coolDownUntil: integer("cool_down_until", { mode: "timestamp_ms" }),
});
