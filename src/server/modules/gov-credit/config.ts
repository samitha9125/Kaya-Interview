// The credit-score policy's numbers (SPEC §6.4). The cache lifetime comes
// from CREDIT_CACHE_TTL_DAYS (TD7); the rest are fixed policy.
export const CREDIT_POLICY = {
  // BR-CRED-02: a score up to 90 days old may stand in when no fresh
  // call is possible, marked stale.
  staleWindowMs: 90 * 24 * 60 * 60_000,
  // BR-CRED-05: one retry after about a second, ±25%, then 15 minutes off.
  retryDelayMs: 1_000,
  retryJitter: 0.25,
  coolDownMs: 15 * 60_000,
} as const;

export const DAY_MS = 24 * 60 * 60_000;
