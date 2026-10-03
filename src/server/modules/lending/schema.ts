import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// BR-LEND-07: the customer agreed to a credit check for these exact terms,
// in this conversation. The assessment takes its amount and term from here,
// so nothing between consent and decision can change them.
export const consents = sqliteTable(
  "consents",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").notNull(),
    conversationId: text("conversation_id").notNull(),
    amountLkr: integer("amount_lkr").notNull(),
    termMonths: integer("term_months").notNull(),
    givenAt: integer("given_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("consents_customer_idx").on(table.customerId)],
);

// FR-LEND-01. One assessment per consent: the consent ID is the business
// identity a replayed step finds its earlier result by (FR-PLAT-05). No
// score or band is stored here (BR-LEND-11); provisional outcome,
// confidence and threshold are kept for tuning the threshold later (D10).
export const loanAssessments = sqliteTable(
  "loan_assessments",
  {
    id: text("id").primaryKey(),
    consentId: text("consent_id")
      .notNull()
      .unique()
      .references(() => consents.id),
    customerId: text("customer_id").notNull(),
    conversationId: text("conversation_id").notNull(),
    amountLkr: integer("amount_lkr").notNull(),
    termMonths: integer("term_months").notNull(),
    outcome: text("outcome", { enum: ["eligible", "not_eligible", "referred"] }).notNull(),
    ineligibleReason: text("ineligible_reason", {
      enum: ["credit_profile", "amount_above_limit", "repayment_too_high"],
    }),
    referralReason: text("referral_reason", {
      enum: ["stale_score", "no_credit_history", "missing_bank_record", "below_threshold"],
    }),
    provisionalOutcome: text("provisional_outcome", { enum: ["eligible", "not_eligible"] }),
    confidenceBp: integer("confidence_bp"),
    thresholdBp: integer("threshold_bp").notNull(),
    scoreFetchedAt: integer("score_fetched_at", { mode: "timestamp_ms" }).notNull(),
    scoreStale: integer("score_stale", { mode: "boolean" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("loan_assessments_customer_idx").on(table.customerId)],
);

// An application only comes from an assessment, at most one per assessment
// (BR-LEND-10: the assessment ID is the submit's idempotency key). A
// referral waits for an officer; only an officer's "declined" closes an
// application, and the partial unique index allows one open application
// per customer (BR-LEND-08).
export const loanApplications = sqliteTable(
  "loan_applications",
  {
    id: text("id").primaryKey(),
    assessmentId: text("assessment_id")
      .notNull()
      .unique()
      .references(() => loanAssessments.id),
    customerId: text("customer_id").notNull(),
    status: text("status", { enum: ["approved", "referred"] }).notNull(),
    amountLkr: integer("amount_lkr").notNull(),
    termMonths: integer("term_months").notNull(),
    officerDecision: text("officer_decision", { enum: ["approved", "declined"] }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("loan_applications_one_open_idx")
      .on(table.customerId)
      .where(sql`${table.officerDecision} IS NOT 'declined'`),
  ],
);
