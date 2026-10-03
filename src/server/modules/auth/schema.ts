import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// The customer's bank record. Income and repayments are nullable because a
// record can lack them, which is a hard referral (BR-LEND-06).
export const customers = sqliteTable("customers", {
  id: text("id").primaryKey(),
  customerNumber: text("customer_number").notNull().unique(),
  fullName: text("full_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  nicEncrypted: text("nic_encrypted").notNull(),
  mobileNumber: text("mobile_number").notNull(),
  monthlyIncomeLkr: integer("monthly_income_lkr"),
  monthlyRepaymentsLkr: integer("monthly_repayments_lkr"),
  failedLoginCount: integer("failed_login_count").notNull().default(0),
  lockedUntil: integer("locked_until", { mode: "timestamp_ms" }),
});

// FR-AUTH-02: only the SHA-256 of the token is stored, so a row read from
// the database can't be replayed as a cookie. A guest session (FR-AUTH-05)
// has no customer.
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    tokenHash: text("token_hash").notNull().unique(),
    customerId: text("customer_id").references(() => customers.id),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }).notNull(),
    stepUpAt: integer("step_up_at", { mode: "timestamp_ms" }),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  },
  (table) => [index("sessions_customer_idx").on(table.customerId)],
);
