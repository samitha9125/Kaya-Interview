import { describe, expect, it } from "vitest";
import { assessEligibility, bandFor, monthlyInstalmentLkr, repaymentToIncomeBp } from "./rules";

describe("lending/rules: bands (BR-LEND-01)", () => {
  it.each([
    { score: 549, band: "D" },
    { score: 550, band: "C" },
    { score: 749, band: "B" },
    { score: 750, band: "A" },
  ])("BR-LEND-01: score $score → band $band", ({ score, band }) => {
    expect(bandFor(score).band).toBe(band);
  });
});

describe("lending/rules: the instalment (BR-LEND-02)", () => {
  // Standard amortised payments at 14% a year, rounded up to the rupee.
  it.each([
    { amountLkr: 500_000, termMonths: 24, instalmentLkr: 24_007 }, // 24,006.44
  ])(
    "BR-LEND-02: LKR $amountLkr over $termMonths months → LKR $instalmentLkr a month",
    ({ amountLkr, termMonths, instalmentLkr }) => {
      expect(monthlyInstalmentLkr(amountLkr, termMonths)).toBe(instalmentLkr);
    },
  );
});

describe("lending/rules: repayment-to-income (BR-LEND-02)", () => {
  it.each([
    { repaymentsLkr: 40_000, bp: 4_000 },
    { repaymentsLkr: 40_010, bp: 4_001 },
  ])(
    "BR-LEND-02: LKR $repaymentsLkr a month on LKR 100,000 income → $bp bp",
    ({ repaymentsLkr, bp }) => {
      expect(repaymentToIncomeBp(repaymentsLkr, 100_000)).toBe(bp);
    },
  );
});

// LKR 500,000 over 24 months is a 24,007 instalment; existing repayments
// set the total against an income of 100,000.
const application = (overrides: Partial<Parameters<typeof assessEligibility>[0]> = {}) => ({
  score: 780,
  amountLkr: 500_000,
  termMonths: 24,
  monthlyIncomeLkr: 100_000,
  monthlyRepaymentsLkr: 0,
  ...overrides,
});

describe("lending/rules: eligibility (BR-LEND-03)", () => {
  it.each([
    { existingLkr: 15_993, eligible: true }, // 4,000 bp: at the limit is allowed
    { existingLkr: 16_003, eligible: false }, // 4,001 bp
  ])(
    "BR-LEND-02: existing repayments LKR $existingLkr → eligible $eligible",
    ({ existingLkr, eligible }) => {
      const result = assessEligibility(application({ monthlyRepaymentsLkr: existingLkr }));

      expect(result.eligible).toBe(eligible);
    },
  );

  it.each([
    { score: 550, amountLkr: 500_000, reason: null }, // band C, at its maximum
    { score: 550, amountLkr: 500_001, reason: "amount_above_limit" }, // one rupee over
  ])(
    "BR-LEND-03: score $score asking for LKR $amountLkr → reason $reason",
    ({ score, amountLkr, reason }) => {
      const result = assessEligibility(
        application({ score, amountLkr, termMonths: 60, monthlyIncomeLkr: 1_000_000 }),
      );

      expect(result).toMatchObject({ eligible: reason === null, reason });
    },
  );
});
