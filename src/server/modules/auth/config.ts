// BR-AUTH-02: 5 consecutive failures lock the account for 15 minutes.
export const LOCKOUT_POLICY = { maxFailedAttempts: 5, lockMs: 15 * 60_000 } as const;

export type LockoutPolicy = { maxFailedAttempts: number; lockMs: number };

// FR-AUTH-07: 10 login attempts per IP per 15 minutes.
export const LOGIN_RATE_LIMIT = { limit: 10, windowMs: 15 * 60_000 } as const;
