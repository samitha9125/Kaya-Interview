import { describe, expect, it } from "vitest";
import { decideLoan, type DecisionInput } from "./decide";

const NOW = new Date("2026-10-03T10:00:00.000Z");
const DAY = 24 * 60 * 60_000;

// Eligible and far from every edge (10,000 bp) unless a test moves it.
const input = (overrides: Partial<DecisionInput> = {}): DecisionInput => ({
  amountLkr: 1_000_000,
  termMonths: 60,
  monthlyIncomeLkr: 200_000,
  monthlyRepaymentsLkr: 0,
  credit: { score: 800, hasHistory: true, stale: false, fetchedAt: NOW },
  thresholdBp: 9_500,
  now: NOW,
  ...overrides,
});

// A score 32 days old costs (32 − 7) × 20 = 500 bp; 33 days, 520 bp.
const scoreAged = (days: number) => ({
  credit: {
    score: 800,
    hasHistory: true,
    stale: false,
    fetchedAt: new Date(NOW.getTime() - days * DAY),
  },
});

describe("lending/decide: the auto-decision threshold (BR-LEND-05)", () => {
  it.each([
    { days: 32, outcome: "eligible" }, // 9,500 bp: exactly at the threshold → outcome
    { days: 33, outcome: "referred" }, // 9,480 bp: below → referral
  ])("P0-07: an eligible case with a score $days days old → $outcome", ({ days, outcome }) => {
    expect(decideLoan(input(scoreAged(days))).outcome).toBe(outcome);
  });
});

describe("lending/decide: hard referral rules (BR-LEND-06)", () => {
  it.each([
    {
      case: "a stale score",
      overrides: { credit: { score: 800, hasHistory: true, stale: true, fetchedAt: NOW } },
      reason: "stale_score",
    },
    {
      case: "no credit history",
      overrides: { credit: { score: null, hasHistory: false, stale: false, fetchedAt: NOW } },
      reason: "no_credit_history",
    },
    {
      case: "no income on the bank record",
      overrides: { monthlyIncomeLkr: null },
      reason: "missing_bank_record",
    },
    {
      case: "no repayments on the bank record",
      overrides: { monthlyRepaymentsLkr: null },
      reason: "missing_bank_record",
    },
  ])("P0-08: $case → referral even with the threshold at 0", ({ overrides, reason }) => {
    const result = decideLoan(input({ ...overrides, thresholdBp: 0 }));

    expect(result).toMatchObject({ outcome: "referred", referralReason: reason });
  });
});
