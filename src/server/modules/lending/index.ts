import "server-only";
export { PRODUCT } from "./config";
export {
  decideLoan,
  type CreditInput,
  type DecisionInput,
  type LoanDecision,
  type ReferralReason,
} from "./decide";
export type { IneligibleReason } from "./rules";
