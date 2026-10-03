import { eq } from "drizzle-orm";
import type { DbExecutor } from "@/server/platform/db";
import { consents, loanApplications, loanAssessments } from "./schema";

// Demo only: clears one customer's loan journey so it can be tried again.
// The audit trail and the credit cache stay (the cache spares the daily
// budget). Applications go first, as they point at assessments, which
// point at consents.
export function resetCustomerLoans(executor: DbExecutor, customerId: string): void {
  executor.delete(loanApplications).where(eq(loanApplications.customerId, customerId)).run();
  executor.delete(loanAssessments).where(eq(loanAssessments.customerId, customerId)).run();
  executor.delete(consents).where(eq(consents.customerId, customerId)).run();
}
