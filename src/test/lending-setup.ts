import type { CreditBureau } from "@/server/modules/gov-credit";
import type { BankRecord, LendingDeps } from "@/server/modules/lending";
import { creditTestSetup } from "@/test/credit-setup";
import { sequentialIds } from "@/test/fakes";

export const CONTEXT = {
  customerId: "customer-a",
  conversationId: "conversation-1",
  correlationId: "corr-1",
} as const;

// Comfortable figures: a band-A score with these terms is eligible with
// full confidence, so each test changes only what it is about.
export const GOOD_RECORD: BankRecord = { monthlyIncomeLkr: 250_000, monthlyRepaymentsLkr: 20_000 };
export const TERMS = { amountLkr: 500_000, termMonths: 36 } as const;

// Real lending and gov-credit code on real in-memory SQLite; only the
// bureau (an external system) is faked.
export function lendingTestSetup(
  bureau: CreditBureau,
  loadBankRecord: LendingDeps["loadBankRecord"] = () => GOOD_RECORD,
) {
  const credit = creditTestSetup(bureau);
  const deps: LendingDeps = {
    db: credit.handle.db,
    audit: credit.deps.audit,
    clock: credit.deps.clock,
    ids: sequentialIds("lend"),
    credit: credit.deps,
    thresholdBp: 9_500,
    loadBankRecord,
  };
  const count = (table: string) =>
    credit.handle.sqlite.prepare(`SELECT count(*) FROM ${table}`).pluck().get() as number;
  const auditTypes = () =>
    credit.handle.sqlite.prepare("SELECT type FROM audit_events ORDER BY at, id").pluck().all();
  return { ...credit, deps, count, auditTypes };
}
