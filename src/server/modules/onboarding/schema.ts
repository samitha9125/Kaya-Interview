import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// B3, FR-ONB-02: an account-opening application, which the branch
// completes when the applicant brings their original NIC. Everything the
// applicant typed is in one encrypted column (FR-PLAT-02). It starts as a
// draft; confirming makes it a pending application, still unverified.
export const kycApplications = sqliteTable(
  "kyc_applications",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").notNull(),
    status: text("status", { enum: ["draft", "pending_verification"] }).notNull(),
    detailsEncrypted: text("details_encrypted").notNull(),
    // BR-ONB-02: for the branch only. The applicant is never told.
    matchesExistingCustomer: integer("matches_existing_customer", { mode: "boolean" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    confirmedAt: integer("confirmed_at", { mode: "timestamp_ms" }),
  },
  (table) => [index("kyc_applications_conversation_idx").on(table.conversationId)],
);
