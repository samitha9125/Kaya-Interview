import { describe, expect, it } from "vitest";
import { assessConfidence, type ConfidenceInput } from "./confidence";

const confidenceBp = (input: ConfidenceInput) => assessConfidence(input).confidenceBp;

const DAY = 24 * 60 * 60_000;
const NOW = new Date("2026-10-03T10:00:00.000Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);

// Far from every edge: full confidence.
const clear = (overrides: Partial<ConfidenceInput> = {}): ConfidenceInput => ({
  score: 800,
  repaymentToIncomeBp: 2_000,
  amountLkr: 1_000_000,
  maxAmountLkr: 3_000_000,
  scoreFetchedAt: NOW,
  now: NOW,
  ...overrides,
});

describe("lending/confidence: repayment-to-income near the limit", () => {
  it.each([
    { rtiBp: 3_699, expected: 10_000 }, // 301 bp under: no penalty
    { rtiBp: 3_700, expected: 8_000 }, // 300 bp under: within
  ])("BR-LEND-04: RTI $rtiBp bp → $expected bp", ({ rtiBp, expected }) => {
    expect(confidenceBp(clear({ repaymentToIncomeBp: rtiBp }))).toBe(expected);
  });
});

describe("lending/confidence: score near a band edge", () => {
  it.each([
    { score: 734, expected: 10_000 }, // 16 below 750
    { score: 735, expected: 9_000 }, // 15 below
  ])("BR-LEND-04: score $score → $expected bp", ({ score, expected }) => {
    expect(confidenceBp(clear({ score }))).toBe(expected);
  });
});

describe("lending/confidence: amount near the band maximum", () => {
  it.each([
    { amountLkr: 2_699_999, expected: 10_000 }, // just under 90%
    { amountLkr: 2_700_000, expected: 9_000 }, // 90% exactly
    { amountLkr: 3_000_001, expected: 10_000 }, // just over: not borderline, over
  ])(
    "BR-LEND-04: LKR $amountLkr of a 3,000,000 maximum → $expected bp",
    ({ amountLkr, expected }) => {
      expect(confidenceBp(clear({ amountLkr }))).toBe(expected);
    },
  );
});

describe("lending/confidence: score age", () => {
  it.each([
    { days: 7, expected: 10_000 }, // the first 7 days are free
    { days: 8, expected: 9_980 },
  ])("BR-LEND-04: a score $days days old → $expected bp", ({ days, expected }) => {
    expect(confidenceBp(clear({ scoreFetchedAt: daysAgo(days) }))).toBe(expected);
  });
});

describe("lending/confidence: the reasons behind the number", () => {
  it("BR-LEND-04: each penalty is named with its size, so the audit trail can explain it", () => {
    const result = assessConfidence(
      clear({ score: 735, amountLkr: 2_700_000, scoreFetchedAt: daysAgo(8) }),
    );

    expect(result).toEqual({
      confidenceBp: 7_980,
      reasons: [
        { code: "score_near_band_edge", penaltyBp: 1_000 },
        { code: "amount_near_band_max", penaltyBp: 1_000 },
        { code: "score_age", penaltyBp: 20 },
      ],
    });
  });
});
