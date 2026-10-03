// BR-AUTH-02: 5 consecutive failures lock the account for 15 minutes.
export const LOCKOUT_POLICY = { maxFailedAttempts: 5, lockMs: 15 * 60_000 } as const;

export type LockoutPolicy = { maxFailedAttempts: number; lockMs: number };

// FR-AUTH-07: 10 login attempts per IP per 15 minutes.
export const LOGIN_RATE_LIMIT = { limit: 10, windowMs: 15 * 60_000 } as const;

// FR-AUTH-03: sessions end after 15 idle minutes or 2 hours in total.
export const SESSION_POLICY = { idleMs: 15 * 60_000, absoluteMs: 2 * 60 * 60_000 } as const;

export type SessionPolicy = { idleMs: number; absoluteMs: number };

// BR-AUTH-03: a step-up is good for 5 minutes.
export const STEP_UP_VALID_MS = 5 * 60_000;
