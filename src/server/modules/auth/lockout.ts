import type { LockoutPolicy } from "./config";

export type LockoutState = { failedAttempts: number; lockedUntil: Date | null };

export function isLocked(state: LockoutState, now: Date): boolean {
  return state.lockedUntil !== null && now < state.lockedUntil;
}

// Failures keep counting during a lock but never push its end back, so a
// customer locked out by someone else's guessing gets in at the stated time.
export function registerFailure(
  state: LockoutState,
  now: Date,
  policy: LockoutPolicy,
): LockoutState {
  const lockExpired = state.lockedUntil !== null && !isLocked(state, now);
  const previous = lockExpired ? 0 : state.failedAttempts;
  const failedAttempts = previous + 1;
  if (state.lockedUntil !== null && !lockExpired) {
    return { failedAttempts, lockedUntil: state.lockedUntil };
  }
  const reachesLimit = failedAttempts >= policy.maxFailedAttempts;
  return {
    failedAttempts,
    lockedUntil: reachesLimit ? new Date(now.getTime() + policy.lockMs) : null,
  };
}

export function registerSuccess(): LockoutState {
  return { failedAttempts: 0, lockedUntil: null };
}
