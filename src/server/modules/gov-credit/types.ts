import type { AuditLog } from "@/server/platform/audit";
import type { Clock } from "@/server/platform/clock";
import type { AppDatabase } from "@/server/platform/db";
import type { CreditBureau } from "./ports";

// FR-CRED-04. The agent maps each reason to a situation label; the raw
// value never reaches the LLM.
export type ScoreFailureReason = "budget_exhausted" | "blocked" | "cooling_down" | "unavailable";

export type ScoreResult =
  | { ok: true; score: number | null; hasHistory: boolean; fetchedAt: Date; stale: boolean }
  | { ok: false; reason: ScoreFailureReason };

export type ScoreRequest = { customerId: string; correlationId: string; conversationId?: string };

export type GovCreditDeps = {
  db: AppDatabase;
  audit: AuditLog;
  clock: Clock;
  bureau: CreditBureau;
  cacheTtlDays: number;
  // The NIC comes from the customer's record, decrypted only when a call
  // is about to be made (BR-AUTH-01).
  loadNic: (customerId: string) => string | undefined;
  sleep: (ms: number) => Promise<void>;
  random: () => number;
};
