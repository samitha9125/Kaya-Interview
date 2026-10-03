import { and, eq } from "drizzle-orm";
import { writeWithAudit } from "@/server/platform/audit";
import { decryptField, encryptField } from "@/server/platform/crypto";
import { runInTransaction } from "@/server/platform/db";
import { parseKycForm, type KycForm } from "./kyc-form";
import { kycApplications } from "./schema";
import type { ConfirmResult, KycContext, OnboardingDeps, SaveDraftResult } from "./types";

// FR-ONB-02: the form is validated and stored encrypted here; the graph
// only ever gets the draft ID. BR-ONB-02, P0-14: the answer is the same
// whether or not the NIC belongs to a customer. The match is recorded for
// the branch, and the check runs for every applicant.
export function saveKycDraft(
  input: unknown,
  context: KycContext,
  deps: OnboardingDeps,
): SaveDraftResult {
  const parsed = parseKycForm(input, deps.clock.now());
  if (!parsed.ok) return parsed;
  const matchesExistingCustomer = deps.isExistingCustomerNic(parsed.form.nic);
  const draftId = deps.ids.newId();
  return writeWithAudit(deps.db, deps.audit, (tx) => {
    tx.insert(kycApplications)
      .values({
        id: draftId,
        conversationId: context.conversationId,
        status: "draft",
        detailsEncrypted: encryptField(JSON.stringify(parsed.form), deps.encryptionKey),
        matchesExistingCustomer,
        createdAt: deps.clock.now(),
      })
      .run();
    return {
      result: { ok: true, draftId },
      event: { ...auditFields(context), type: "kyc.draft_saved", payload: { draftId } },
    };
  });
}

// FR-ONB-02: confirming is idempotent. A replay finds the application
// already pending and returns it, so one draft is one application. A
// draft from another conversation is not found.
export function confirmKycApplication(
  draftId: string,
  context: KycContext,
  deps: OnboardingDeps,
): ConfirmResult {
  return runInTransaction(deps.db, (tx) => {
    const row = tx
      .select({ status: kycApplications.status })
      .from(kycApplications)
      .where(ownDraft(draftId, context))
      .get();
    if (!row) return { ok: false, reason: "not_found" };
    if (row.status === "pending_verification") return { ok: true, applicationId: draftId };
    tx.update(kycApplications)
      .set({ status: "pending_verification", confirmedAt: deps.clock.now() })
      .where(eq(kycApplications.id, draftId))
      .run();
    deps.audit.record(tx, {
      ...auditFields(context),
      type: "kyc.application_pending",
      payload: { applicationId: draftId },
    });
    return { ok: true, applicationId: draftId };
  });
}

// The applicant's own details, for the confirmation summary they review.
// They were validated before they were stored, and GCM refuses anything
// altered since, so they are read back as they were written.
export function readKycDetails(
  draftId: string,
  context: KycContext,
  deps: OnboardingDeps,
): KycForm | undefined {
  const row = deps.db
    .select({ detailsEncrypted: kycApplications.detailsEncrypted })
    .from(kycApplications)
    .where(ownDraft(draftId, context))
    .get();
  return row
    ? (JSON.parse(decryptField(row.detailsEncrypted, deps.encryptionKey)) as KycForm)
    : undefined;
}

function ownDraft(draftId: string, { conversationId }: KycContext) {
  return and(eq(kycApplications.id, draftId), eq(kycApplications.conversationId, conversationId));
}

function auditFields({ conversationId, correlationId, actor }: KycContext) {
  return { conversationId, correlationId, actor };
}
