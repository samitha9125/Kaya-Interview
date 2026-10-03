import { runInTransaction, type DbExecutor } from "@/server/platform/db";
import { findApplicationFor, findOpenApplication, insertApplication } from "./applications";
import { findAssessment } from "./assess";
import { ASSESSMENT_VALIDITY_MS } from "./config";
import type { LendingDeps, SubmitRequest, SubmitResult } from "./types";

// BR-LEND-10. The step-up within 5 minutes is checked by the agent before
// it calls this (auth owns sessions); everything about the assessment
// itself is checked here, in one transaction with the write.
export function submitApplication(request: SubmitRequest, deps: LendingDeps): SubmitResult {
  return runInTransaction(deps.db, (tx) => {
    const result = submitInTransaction(tx, request, deps);
    deps.audit.record(tx, {
      type: result.ok ? "loan.applied" : "loan.submit_refused",
      correlationId: request.correlationId,
      conversationId: request.conversationId,
      actor: request.customerId,
      payload: { assessmentId: request.assessmentId, ...result },
    });
    return result;
  });
}

function submitInTransaction(
  tx: DbExecutor,
  request: SubmitRequest,
  deps: LendingDeps,
): SubmitResult {
  const assessment = findAssessment(tx, request.assessmentId, request);
  if (!assessment) return { ok: false, reason: "not_found" };
  if (assessment.outcome !== "eligible") return { ok: false, reason: "not_submittable" };
  // The assessment ID is the idempotency key: a replay gets the original
  // application, even after the assessment has expired.
  const earlier = findApplicationFor(tx, assessment.id);
  if (earlier) return { ok: true, applicationId: earlier.id };
  if (assessment.amountLkr !== request.amountLkr || assessment.termMonths !== request.termMonths) {
    return { ok: false, reason: "terms_changed" };
  }
  const ageMs = deps.clock.now().getTime() - assessment.createdAt.getTime();
  if (ageMs >= ASSESSMENT_VALIDITY_MS) return { ok: false, reason: "expired" };
  const open = findOpenApplication(tx, assessment.customerId);
  if (open) return { ok: false, reason: "open_application", status: open.status };
  return { ok: true, applicationId: insertApplication(tx, assessment, "approved", deps) };
}
