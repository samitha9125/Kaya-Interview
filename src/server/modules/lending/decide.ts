import { confidenceBp } from "./confidence";
import { assessEligibility, type Eligibility, type IneligibleReason } from "./rules";

export type CreditInput = {
  score: number | null;
  hasHistory: boolean;
  stale: boolean;
  fetchedAt: Date;
};

export type DecisionInput = {
  amountLkr: number;
  termMonths: number;
  monthlyIncomeLkr: number | null;
  monthlyRepaymentsLkr: number | null;
  credit: CreditInput;
  thresholdBp: number;
  now: Date;
};

export type ReferralReason =
  "stale_score" | "no_credit_history" | "missing_bank_record" | "below_threshold";

type Provisional = "eligible" | "not_eligible";

export type LoanDecision =
  | { outcome: "eligible"; confidenceBp: number; thresholdBp: number }
  | { outcome: "not_eligible"; reason: IneligibleReason; confidenceBp: number; thresholdBp: number }
  | {
      outcome: "referred";
      referralReason: ReferralReason;
      // What the rules would have said, kept for the officer and for
      // tuning the threshold from their decisions later (D10).
      provisional: Provisional | null;
      confidenceBp: number | null;
      thresholdBp: number;
    };

// BR-LEND-05/06. Poor data never produces a final outcome, whatever the
// threshold; otherwise the outcome is final only at or above it.
export function decideLoan(input: DecisionInput): LoanDecision {
  const { thresholdBp, credit } = input;
  const refer = (
    referralReason: ReferralReason,
    provisional: Provisional | null = null,
    confidence: number | null = null,
  ) =>
    ({
      outcome: "referred",
      referralReason,
      provisional,
      confidenceBp: confidence,
      thresholdBp,
    }) as const;
  if (!credit.hasHistory || credit.score === null) return refer("no_credit_history");
  if (!input.monthlyIncomeLkr || input.monthlyRepaymentsLkr === null)
    return refer("missing_bank_record");
  const eligibility = assessEligibility({
    score: credit.score,
    amountLkr: input.amountLkr,
    termMonths: input.termMonths,
    monthlyIncomeLkr: input.monthlyIncomeLkr,
    monthlyRepaymentsLkr: input.monthlyRepaymentsLkr,
  });
  const confidence = confidenceFor(eligibility, credit.score, input);
  const provisional: Provisional = eligibility.eligible ? "eligible" : "not_eligible";
  if (credit.stale) return refer("stale_score", provisional, confidence);
  if (confidence < thresholdBp) return refer("below_threshold", provisional, confidence);
  return eligibility.reason === null
    ? { outcome: "eligible", confidenceBp: confidence, thresholdBp }
    : {
        outcome: "not_eligible",
        reason: eligibility.reason,
        confidenceBp: confidence,
        thresholdBp,
      };
}

function confidenceFor(eligibility: Eligibility, score: number, input: DecisionInput): number {
  return confidenceBp({
    score,
    repaymentToIncomeBp: eligibility.repaymentToIncomeBp,
    amountLkr: input.amountLkr,
    maxAmountLkr: eligibility.maxAmountLkr,
    scoreFetchedAt: input.credit.fetchedAt,
    now: input.now,
  });
}
