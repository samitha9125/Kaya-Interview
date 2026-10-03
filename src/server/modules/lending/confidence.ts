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

export type ConfidenceReason = {
  code: "repayment_near_limit" | "score_near_band_edge" | "amount_near_band_max" | "score_age";
  penaltyBp: number;
};

export type Confidence = { confidenceBp: number; reasons: ConfidenceReason[] };

// BR-LEND-04 (TD9): how far the case sits from the rule edges, and how old
// its data is. An illustrative policy heuristic, not a probability. Each
// penalty is named, so the audit trail can say why a case fell short.
export function assessConfidence(input: ConfidenceInput): Confidence {
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
  const reasons: ConfidenceReason[] = [
    {
      code: "repayment_near_limit" as const,
      penaltyBp: nearLimit ? repaymentNearLimit.penaltyBp : 0,
    },
    {
      code: "score_near_band_edge" as const,
      penaltyBp: nearEdge ? scoreNearBandEdge.penaltyBp : 0,
    },
    { code: "amount_near_band_max" as const, penaltyBp: nearMax ? amountNearBandMax.penaltyBp : 0 },
    { code: "score_age" as const, penaltyBp: agePenalty },
  ].filter((reason) => reason.penaltyBp > 0);
  const penalty = reasons.reduce((sum, reason) => sum + reason.penaltyBp, 0);
  return { confidenceBp: Math.max(0, FULL_CONFIDENCE_BP - penalty), reasons };
}
