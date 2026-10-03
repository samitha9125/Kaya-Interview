import { describe, expect, it } from "vitest";
import { confidenceBp, type ConfidenceInput } from "./confidence";

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

describe("lending/confidence: starting point (BR-LEND-04)", () => {
  it("BR-LEND-04: a case far from every edge keeps full confidence", () => {
    expect(confidenceBp(clear())).toBe(10_000);
  });
});

describe("lending/confidence: repayment-to-income near the limit", () => {
  it.each([
    { rtiBp: 3_699, expected: 10_000 }, // 301 bp under: no penalty
    { rtiBp: 3_700, expected: 8_000 }, // 300 bp under: within
    { rtiBp: 4_000, expected: 8_000 },
    { rtiBp: 4_300, expected: 8_000 }, // 300 bp over: within
    { rtiBp: 4_301, expected: 10_000 },
  ])("BR-LEND-04: RTI $rtiBp bp → $expected bp", ({ rtiBp, expected }) => {
    expect(confidenceBp(clear({ repaymentToIncomeBp: rtiBp }))).toBe(expected);
  });
});

describe("lending/confidence: score near a band edge", () => {
  it.each([
    { score: 734, expected: 10_000 }, // 16 below 750
    { score: 735, expected: 9_000 }, // 15 below
    { score: 765, expected: 9_000 }, // 15 above
    { score: 766, expected: 10_000 },
    { score: 650, expected: 9_000 },
    { score: 564, expected: 9_000 }, // 14 above 550
    { score: 600, expected: 10_000 }, // 50 from both 550 and 650
  ])("BR-LEND-04: score $score → $expected bp", ({ score, expected }) => {
    expect(confidenceBp(clear({ score }))).toBe(expected);
  });
});

describe("lending/confidence: amount near the band maximum", () => {
  it.each([
    { amountLkr: 2_699_700, expected: 10_000 }, // 89.99%
    { amountLkr: 2_699_999, expected: 10_000 }, // just under 90%
    { amountLkr: 2_700_000, expected: 9_000 }, // 90% exactly
    { amountLkr: 3_000_000, expected: 9_000 }, // 100%: the maximum itself
    { amountLkr: 3_000_001, expected: 10_000 }, // just over: not borderline, over
    { amountLkr: 3_000_300, expected: 10_000 }, // 100.01%
  ])(
    "BR-LEND-04: LKR $amountLkr of a 3,000,000 maximum → $expected bp",
    ({ amountLkr, expected }) => {
      expect(confidenceBp(clear({ amountLkr }))).toBe(expected);
    },
  );

  it("BR-LEND-04: band D has no maximum, so there's no amount penalty", () => {
    expect(confidenceBp(clear({ score: 400, maxAmountLkr: 0 }))).toBe(10_000);
  });
});

describe("lending/confidence: score age", () => {
  it.each([
    { days: 7, expected: 10_000 }, // the first 7 days are free
    { days: 8, expected: 9_980 },
    { days: 30, expected: 9_540 }, // 23 days × 20
  ])("BR-LEND-04: a score $days days old → $expected bp", ({ days, expected }) => {
    expect(confidenceBp(clear({ scoreFetchedAt: daysAgo(days) }))).toBe(expected);
  });

  it("BR-LEND-04: part of a day doesn't count as a day", () => {
    expect(confidenceBp(clear({ scoreFetchedAt: new Date(daysAgo(8).getTime() + 1) }))).toBe(
      10_000,
    );
  });
});

describe("lending/confidence: combined", () => {
  it("BR-LEND-04: penalties add up", () => {
    const worst = clear({
      score: 750,
      repaymentToIncomeBp: 4_000,
      amountLkr: 3_000_000,
      scoreFetchedAt: daysAgo(30),
    });

    expect(confidenceBp(worst)).toBe(10_000 - 2_000 - 1_000 - 1_000 - 460);
  });

  it("BR-LEND-04: confidence never goes below zero", () => {
    expect(confidenceBp(clear({ repaymentToIncomeBp: 4_000, scoreFetchedAt: daysAgo(500) }))).toBe(
      0,
    );
  });
});
