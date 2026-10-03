import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
