import type { AuditLog } from "@/server/platform/audit";
import type { Clock } from "@/server/platform/clock";
import type { AppDatabase } from "@/server/platform/db";
import type { IdGenerator } from "@/server/platform/ids";
import type { KycFormErrors } from "./kyc-form";

export type OnboardingDeps = {
  db: AppDatabase;
  audit: AuditLog;
  clock: Clock;
  ids: IdGenerator;
  encryptionKey: Buffer;
  // BR-ONB-02: auth owns customers, so the check is injected.
  isExistingCustomerNic: (nic: string) => boolean;
};

// Who is acting and where: an application belongs to its conversation.
export type KycContext = { conversationId: string; correlationId: string; actor: string };

export type SaveDraftResult = { ok: true; draftId: string } | { ok: false; errors: KycFormErrors };

export type ConfirmResult =
  { ok: true; applicationId: string } | { ok: false; reason: "not_found" };
