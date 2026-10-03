import { and, eq, sql } from "drizzle-orm";
import type { DbExecutor } from "@/server/platform/db";
import { loanApplications, type loanAssessments } from "./schema";
import type { ApplicationStatus, LendingDeps, OpenApplication } from "./types";

type AssessmentRow = typeof loanAssessments.$inferSelect;

// BR-LEND-08: open until an officer declines it. The same condition as the
// partial unique index in the schema.
const isOpen = sql`${loanApplications.officerDecision} IS NOT 'declined'`;

export function findOpenApplication(
  executor: DbExecutor,
  customerId: string,
): OpenApplication | undefined {
  const row = executor
    .select({ applicationId: loanApplications.id, status: loanApplications.status })
    .from(loanApplications)
    .where(and(eq(loanApplications.customerId, customerId), isOpen))
    .get();
  return row;
}

export function findApplicationFor(executor: DbExecutor, assessmentId: string) {
  return executor
    .select()
    .from(loanApplications)
    .where(eq(loanApplications.assessmentId, assessmentId))
    .get();
}

export function insertApplication(
  executor: DbExecutor,
  assessment: AssessmentRow,
  status: ApplicationStatus,
  deps: Pick<LendingDeps, "clock" | "ids">,
): string {
  const id = deps.ids.newId();
  executor
    .insert(loanApplications)
    .values({
      id,
      assessmentId: assessment.id,
      customerId: assessment.customerId,
      status,
      amountLkr: assessment.amountLkr,
      termMonths: assessment.termMonths,
      createdAt: deps.clock.now(),
    })
    .run();
  return id;
}
