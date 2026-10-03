// The demo product and its rules (SPEC A2, BR-LEND-01…05, B18). Business
// numbers live here and nowhere else.
export const PRODUCT = {
  minAmountLkr: 50_000,
  maxAmountLkr: 3_000_000,
  minTermMonths: 6,
  maxTermMonths: 60,
  annualRateBp: 1_400,
} as const;

export type Band = "A" | "B" | "C" | "D";

// Highest first: a score belongs to the first band whose minimum it meets.
export const BANDS: { band: Band; minScore: number; maxAmountLkr: number }[] = [
  { band: "A", minScore: 750, maxAmountLkr: 3_000_000 },
  { band: "B", minScore: 650, maxAmountLkr: 1_500_000 },
  { band: "C", minScore: 550, maxAmountLkr: 500_000 },
  { band: "D", minScore: 0, maxAmountLkr: 0 },
];

export const MAX_REPAYMENT_TO_INCOME_BP = 4_000;

export const FULL_CONFIDENCE_BP = 10_000;

// BR-LEND-04: an illustrative policy heuristic, not a measured
// probability (TD9).
export const CONFIDENCE_PENALTIES = {
  repaymentNearLimit: { withinBp: 300, penaltyBp: 2_000 },
  scoreNearBandEdge: { withinPoints: 15, penaltyBp: 1_000 },
  amountNearBandMax: { fromBp: 9_000, penaltyBp: 1_000 },
  scoreAge: { graceDays: 7, penaltyBpPerDay: 20 },
} as const;
