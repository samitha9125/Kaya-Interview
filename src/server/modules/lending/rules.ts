import { BANDS, MAX_REPAYMENT_TO_INCOME_BP, PRODUCT, type Band } from "./config";

export type IneligibleReason = "credit_profile" | "amount_above_limit" | "repayment_too_high";

export type EligibilityInput = {
  score: number;
  amountLkr: number;
  termMonths: number;
  monthlyIncomeLkr: number;
  monthlyRepaymentsLkr: number;
};

export type Eligibility = {
  eligible: boolean;
  reason: IneligibleReason | null;
  band: Band;
  maxAmountLkr: number;
  repaymentToIncomeBp: number;
};

const BAND_D = { band: "D" as const, minScore: 0, maxAmountLkr: 0 };

export function bandFor(score: number): { band: Band; maxAmountLkr: number } {
  const match = BANDS.find((entry) => score >= entry.minScore) ?? BAND_D;
  return { band: match.band, maxAmountLkr: match.maxAmountLkr };
}

// The standard amortised payment, rounded up to the rupee so the check is
// never more generous than the real repayment.
export function monthlyInstalmentLkr(amountLkr: number, termMonths: number): number {
  const monthlyRate = PRODUCT.annualRateBp / 10_000 / 12;
  const payment = (amountLkr * monthlyRate) / (1 - (1 + monthlyRate) ** -termMonths);
  return Math.ceil(payment);
}

// In basis points, rounded up: a fraction over the limit is over it.
export function repaymentToIncomeBp(
  monthlyRepaymentsLkr: number,
  monthlyIncomeLkr: number,
): number {
  return Math.ceil((monthlyRepaymentsLkr * 10_000) / monthlyIncomeLkr);
}

// BR-LEND-03: one reason only, in this order, so the reply is simple.
export function assessEligibility(input: EligibilityInput): Eligibility {
  const { band, maxAmountLkr } = bandFor(input.score);
  const instalment = monthlyInstalmentLkr(input.amountLkr, input.termMonths);
  const rtiBp = repaymentToIncomeBp(
    input.monthlyRepaymentsLkr + instalment,
    input.monthlyIncomeLkr,
  );
  const reason: IneligibleReason | null =
    band === "D"
      ? "credit_profile"
      : input.amountLkr > maxAmountLkr
        ? "amount_above_limit"
        : rtiBp > MAX_REPAYMENT_TO_INCOME_BP
          ? "repayment_too_high"
          : null;
  return { eligible: reason === null, reason, band, maxAmountLkr, repaymentToIncomeBp: rtiBp };
}
