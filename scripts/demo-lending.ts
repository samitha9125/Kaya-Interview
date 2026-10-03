import { findBankRecord, findCustomerNic } from "@/server/modules/auth";
import { resetBudget, type CreditBureau } from "@/server/modules/gov-credit";
import {
  assessLoan,
  findOpenApplication,
  recordConsent,
  submitApplication,
  type LendingDeps,
} from "@/server/modules/lending";
import { registerCitizen } from "@/server/mock-gov";
import { createAuditLog } from "@/server/platform/audit";
import { systemClock } from "@/server/platform/clock";
import type { AppConfig } from "@/server/platform/config";
import { runInTransaction, type AppDatabase } from "@/server/platform/db";
import { randomIds } from "@/server/platform/ids";
import { DEMO_CUSTOMERS } from "./demo-customers";

type Terms = { amountLkr: number; termMonths: number };
type Ending = "eligible" | "not_eligible" | "referred" | "open_application";

// The request a demo walks through, unless a customer's row says otherwise.
export const DEMO_TERMS: Terms = { amountLkr: 500_000, termMonths: 36 };

// FR-PLAT-07: one government score per demo customer (null = no credit
// history), each chosen with the customer's bank record to reach one
// ending at the default threshold. The README's demo script uses these.
export const DEMO_CREDIT: {
  customerNumber: string;
  score: number | null;
  ending: Ending;
  terms?: Terms;
}[] = [
  { customerNumber: "C1001", score: 800, ending: "eligible" },
  { customerNumber: "C1002", score: 500, ending: "not_eligible" }, // credit profile
  { customerNumber: "C1003", score: 655, ending: "referred" }, // near a band edge: below the threshold
  { customerNumber: "C1004", score: null, ending: "referred" }, // no credit history
  { customerNumber: "C1005", score: 720, ending: "open_application" },
  { customerNumber: "C1006", score: 780, ending: "referred" }, // no income on record
  { customerNumber: "C1007", score: 700, ending: "not_eligible" }, // repayments too high
  {
    customerNumber: "C1008",
    score: 880,
    ending: "eligible",
    terms: { amountLkr: 2_000_000, termMonths: 60 },
  },
  {
    customerNumber: "C1009",
    score: 610,
    ending: "eligible",
    terms: { amountLkr: 300_000, termMonths: 36 },
  },
  { customerNumber: "C1010", score: 690, ending: "eligible" },
];

function demoCustomer(customerNumber: string) {
  const customer = DEMO_CUSTOMERS.find((demo) => demo.customerNumber === customerNumber);
  if (!customer) throw new Error(`no demo customer ${customerNumber}`);
  return customer;
}

// The mock government service learns each demo customer's score.
export function seedDemoCitizens(db: AppDatabase): void {
  runInTransaction(db, (tx) => {
    for (const { customerNumber, score } of DEMO_CREDIT) {
      registerCitizen(tx, demoCustomer(customerNumber).nic, score);
    }
  });
}

// The "already has an open application" customer applied in an earlier
// conversation. Their application goes through the real lending flow,
// since an application can only come from an assessment. The seed answers
// for the bureau once, then gives the budget slot back, so the demo starts
// with all five government calls. Safe to re-run.
export async function seedOpenApplication(db: AppDatabase, config: SeedConfig): Promise<void> {
  const row = DEMO_CREDIT.find((entry) => entry.ending === "open_application");
  if (!row) return;
  const customer = demoCustomer(row.customerNumber);
  if (findOpenApplication(db, customer.id)) return;
  const deps = lendingDeps(db, config, row.score);
  const context = {
    customerId: customer.id,
    conversationId: `seed-${customer.id}`,
    correlationId: "SEEDDEMODATA0000",
  };
  const terms = row.terms ?? DEMO_TERMS;
  const consent = recordConsent({ ...context, ...terms }, deps);
  if (!consent.ok) throw new Error("the seeded loan terms are outside the product");
  const assessed = await assessLoan({ ...context, consentId: consent.consentId }, deps);
  if (!assessed.ok) throw new Error(`seeding the open application failed: ${assessed.reason}`);
  const submitted = submitApplication(
    { ...context, assessmentId: assessed.assessment.assessmentId, ...terms },
    deps,
  );
  if (!submitted.ok) throw new Error(`seeding the open application failed: ${submitted.reason}`);
  resetBudget(db, deps.clock.now());
}

type SeedConfig = Pick<
  AppConfig,
  "APP_ENCRYPTION_KEY" | "AUTO_DECISION_THRESHOLD" | "CREDIT_CACHE_TTL_DAYS"
>;

function lendingDeps(db: AppDatabase, config: SeedConfig, score: number | null): LendingDeps {
  const clock = systemClock;
  const audit = createAuditLog({ clock, ids: randomIds });
  const bureau: CreditBureau = {
    callsPerDay: 5,
    fetchScore: async () => (score === null ? { kind: "no_history" } : { kind: "score", score }),
  };
  return {
    db,
    audit,
    clock,
    ids: randomIds,
    thresholdBp: config.AUTO_DECISION_THRESHOLD,
    loadBankRecord: (customerId) => findBankRecord(db, customerId),
    credit: {
      db,
      audit,
      clock,
      bureau,
      cacheTtlDays: config.CREDIT_CACHE_TTL_DAYS,
      loadNic: (customerId) => findCustomerNic(db, customerId, config.APP_ENCRYPTION_KEY),
      sleep: async () => {},
      random: () => 0.5,
    },
  };
}
