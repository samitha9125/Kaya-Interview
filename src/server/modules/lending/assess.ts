import { eq } from "drizzle-orm";
import { getScore } from "@/server/modules/gov-credit";
import { runInTransaction, type DbExecutor } from "@/server/platform/db";
import { findOpenApplication, insertApplication } from "./applications";
import { findConsent } from "./consent";
import { decideLoan, type CreditInput, type LoanDecision } from "./decide";
import { loanAssessments } from "./schema";
import type { AssessResult, Assessment, LendingDeps, LoanContext } from "./types";

type AssessmentRow = typeof loanAssessments.$inferSelect;
type ConsentRow = NonNullable<ReturnType<typeof findConsent>>;

// Consent → credit check → decision, stored with its audit record. The
// score is used here and never leaves the module (BR-LEND-11).
export async function assessLoan(
  request: LoanContext & { consentId: string },
  deps: LendingDeps,
): Promise<AssessResult> {
  const consent = findConsent(deps.db, request.consentId, request);
  if (!consent) return { ok: false, reason: "no_consent" };
  const earlier = earlierResult(deps.db, consent);
  if (earlier) return earlier;
  const credit = await getScore(
    {
      customerId: request.customerId,
      correlationId: request.correlationId,
      conversationId: request.conversationId,
    },
    deps.credit,
  );
  if (!credit.ok) return { ok: false, reason: credit.reason };
  const record = deps.loadBankRecord(request.customerId);
  const decision = decideLoan({
    amountLkr: consent.amountLkr,
    termMonths: consent.termMonths,
    monthlyIncomeLkr: record?.monthlyIncomeLkr ?? null,
    monthlyRepaymentsLkr: record?.monthlyRepaymentsLkr ?? null,
    credit,
    thresholdBp: deps.thresholdBp,
    now: deps.clock.now(),
  });
  return recordDecision(consent, decision, credit, request, deps);
}

// FR-PLAT-05: one assessment per consent, so a replayed step finds the
// first one instead of checking again. BR-LEND-08: with an application
// already open, the customer is shown its status instead.
function earlierResult(executor: DbExecutor, consent: ConsentRow): AssessResult | undefined {
  const earlier = executor
    .select()
    .from(loanAssessments)
    .where(eq(loanAssessments.consentId, consent.id))
    .get();
  if (earlier) return { ok: true, assessment: toAssessment(earlier) };
  const open = findOpenApplication(executor, consent.customerId);
  if (open) return { ok: false, reason: "open_application", status: open.status };
  return undefined;
}

// FR-PLAT-04: the assessment, a referral's application and the audit record
// commit together. The earlier-result check is repeated inside the
// transaction, which holds the write lock, so two racing steps can't both
// write.
function recordDecision(
  consent: ConsentRow,
  decision: LoanDecision,
  credit: CreditInput,
  request: LoanContext,
  deps: LendingDeps,
): AssessResult {
  return runInTransaction(deps.db, (tx) => {
    const earlier = earlierResult(tx, consent);
    if (earlier) return earlier;
    const row = assessmentRow(consent, decision, credit, deps);
    tx.insert(loanAssessments).values(row).run();
    const applicationId =
      decision.outcome === "referred" ? insertApplication(tx, row, "referred", deps) : null;
    deps.audit.record(tx, {
      type: "loan.assessed",
      correlationId: request.correlationId,
      conversationId: request.conversationId,
      actor: "system",
      payload: { ...auditFields(row), applicationId },
    });
    return { ok: true, assessment: toAssessment(row) };
  });
}

function assessmentRow(
  consent: ConsentRow,
  decision: LoanDecision,
  credit: CreditInput,
  deps: LendingDeps,
): AssessmentRow {
  const referred = decision.outcome === "referred";
  return {
    id: deps.ids.newId(),
    consentId: consent.id,
    customerId: consent.customerId,
    conversationId: consent.conversationId,
    amountLkr: consent.amountLkr,
    termMonths: consent.termMonths,
    outcome: decision.outcome,
    ineligibleReason: decision.outcome === "not_eligible" ? decision.reason : null,
    referralReason: referred ? decision.referralReason : null,
    provisionalOutcome: referred ? decision.provisional : null,
    confidenceBp: decision.confidenceBp,
    thresholdBp: decision.thresholdBp,
    scoreFetchedAt: credit.fetchedAt,
    scoreStale: credit.stale,
    createdAt: deps.clock.now(),
  };
}

// Everything a reviewer needs to reconstruct the decision, except the
// score itself.
function auditFields(row: AssessmentRow) {
  const { id, consentId, customerId, outcome, ineligibleReason, referralReason } = row;
  const { provisionalOutcome, confidenceBp, thresholdBp, scoreFetchedAt, scoreStale } = row;
  return {
    assessmentId: id,
    consentId,
    customerId,
    outcome,
    ineligibleReason,
    referralReason,
    provisionalOutcome,
    confidenceBp,
    thresholdBp,
    scoreFetchedAt: scoreFetchedAt.toISOString(),
    scoreStale,
  };
}

function toAssessment(row: AssessmentRow): Assessment {
  return {
    assessmentId: row.id,
    outcome: row.outcome,
    ineligibleReason: row.ineligibleReason,
    amountLkr: row.amountLkr,
    termMonths: row.termMonths,
  };
}

export function findAssessment(executor: DbExecutor, assessmentId: string, context: LoanContext) {
  const row = executor
    .select()
    .from(loanAssessments)
    .where(eq(loanAssessments.id, assessmentId))
    .get();
  const isTheirs =
    row?.customerId === context.customerId && row.conversationId === context.conversationId;
  return isTheirs ? row : undefined;
}
