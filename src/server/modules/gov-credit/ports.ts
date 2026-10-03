// The government credit API, as gov-credit needs it (ARCHITECTURE §5).
// An adapter turns its HTTP into one of these and validates every
// response first, so policy code never sees a raw status or body.
export type BureauFailureCause =
  "timeout" | "server_error" | "network" | "client_error" | "malformed";

export type BureauResult =
  | { kind: "score"; score: number }
  | { kind: "no_history" }
  | { kind: "rate_limited"; retryAfter: Date | null }
  // BR-CRED-05: only a timeout, a 5xx or a network error is worth one retry.
  | { kind: "failure"; cause: BureauFailureCause; isRetryable: boolean };

export type CreditBureau = {
  // BR-CRED-03: the daily budget is whatever the service allows.
  callsPerDay: number;
  fetchScore: (nic: string) => Promise<BureauResult>;
};
