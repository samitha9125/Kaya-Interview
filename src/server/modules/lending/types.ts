import type { GovCreditDeps, ScoreFailureReason } from "@/server/modules/gov-credit";
import type { AuditLog } from "@/server/platform/audit";
import type { Clock } from "@/server/platform/clock";
import type { AppDatabase } from "@/server/platform/db";
import type { IdGenerator } from "@/server/platform/ids";
import type { IneligibleReason } from "./rules";

// The customer's own bank record (SPEC A3). Either figure can be missing,
// which is a hard referral (BR-LEND-06).
export type BankRecord = { monthlyIncomeLkr: number | null; monthlyRepaymentsLkr: number | null };

export type LendingDeps = {
  db: AppDatabase;
  audit: AuditLog;
  clock: Clock;
  ids: IdGenerator;
  credit: GovCreditDeps;
  thresholdBp: number;
  // Identity comes from the signed-in session; the record is looked up by
  // it, never taken from chat (BR-AUTH-01).
  loadBankRecord: (customerId: string) => BankRecord | undefined;
};

export type LoanContext = { customerId: string; conversationId: string; correlationId: string };

export type ApplicationStatus = "approved" | "referred";
export type OpenApplication = { applicationId: string; status: ApplicationStatus };

// What the agent needs to choose a template: no score, band, confidence
// or threshold (BR-LEND-11).
export type Assessment = {
  assessmentId: string;
  outcome: "eligible" | "not_eligible" | "referred";
  ineligibleReason: IneligibleReason | null;
  amountLkr: number;
  termMonths: number;
};

export type AssessResult =
  | { ok: true; assessment: Assessment }
  | { ok: false; reason: "no_consent" | ScoreFailureReason }
  | { ok: false; reason: "open_application"; status: ApplicationStatus };

export type SubmitRequest = LoanContext & {
  assessmentId: string;
  amountLkr: number;
  termMonths: number;
};

export type SubmitRefusal = "not_found" | "not_submittable" | "terms_changed" | "expired";

export type SubmitResult =
  | { ok: true; applicationId: string }
  | { ok: false; reason: SubmitRefusal }
  | { ok: false; reason: "open_application"; status: ApplicationStatus };
