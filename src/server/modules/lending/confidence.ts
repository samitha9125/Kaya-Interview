import {
  BANDS,
  CONFIDENCE_PENALTIES,
  FULL_CONFIDENCE_BP,
  MAX_REPAYMENT_TO_INCOME_BP,
} from "./config";

export type ConfidenceInput = {
  score: number;
  repaymentToIncomeBp: number;
  amountLkr: number;
  maxAmountLkr: number;
  scoreFetchedAt: Date;
  now: Date;
};

const DAY_MS = 24 * 60 * 60_000;
const BAND_EDGES = BANDS.map((band) => band.minScore).filter((edge) => edge > 0);

// BR-LEND-04 (TD9): how far the case sits from the rule edges, and how old
// its data is. An illustrative policy heuristic, not a probability.
export function confidenceBp(input: ConfidenceInput): number {
  const { repaymentNearLimit, scoreNearBandEdge, amountNearBandMax, scoreAge } =
    CONFIDENCE_PENALTIES;
  const nearLimit =
    Math.abs(input.repaymentToIncomeBp - MAX_REPAYMENT_TO_INCOME_BP) <= repaymentNearLimit.withinBp;
  const nearEdge = BAND_EDGES.some(
    (edge) => Math.abs(input.score - edge) <= scoreNearBandEdge.withinPoints,
  );
  // Borderline means 90–100% of the maximum. An amount over it isn't
  // uncertain: it's simply over (B19). Band D's maximum is 0, so nothing
  // is near it.
  const nearMax =
    input.amountLkr <= input.maxAmountLkr &&
    input.amountLkr * 10_000 >= input.maxAmountLkr * amountNearBandMax.fromBp;
  const ageDays = Math.floor((input.now.getTime() - input.scoreFetchedAt.getTime()) / DAY_MS);
  const agePenalty = Math.max(0, ageDays - scoreAge.graceDays) * scoreAge.penaltyBpPerDay;
  const penalty =
    (nearLimit ? repaymentNearLimit.penaltyBp : 0) +
    (nearEdge ? scoreNearBandEdge.penaltyBp : 0) +
    (nearMax ? amountNearBandMax.penaltyBp : 0) +
    agePenalty;
  return Math.max(0, FULL_CONFIDENCE_BP - penalty);
}
