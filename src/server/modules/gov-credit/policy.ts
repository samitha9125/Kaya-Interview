import { CREDIT_POLICY, DAY_MS } from "./config";

const ageMs = (fetchedAt: Date, now: Date) => now.getTime() - fetchedAt.getTime();

// BR-CRED-01: fresh for less than the lifetime; at exactly the lifetime,
// it's a miss.
export function isFresh(fetchedAt: Date, now: Date, ttlDays: number): boolean {
  return ageMs(fetchedAt, now) < ttlDays * DAY_MS;
}

// BR-CRED-02: usable as stale up to and including 90 days.
export function isUsableStale(fetchedAt: Date, now: Date): boolean {
  return ageMs(fetchedAt, now) <= CREDIT_POLICY.staleWindowMs;
}

export type BudgetState = {
  day: string;
  attempts: number;
  blockedUntil: Date | null;
  coolDownUntil: Date | null;
};

export type SlotRefusal = "blocked" | "cooling_down" | "budget_exhausted";

export type SlotDecision = { ok: true; next: BudgetState } | { ok: false; reason: SlotRefusal };

const isBefore = (now: Date, until: Date | null) => until !== null && now < until;

// BR-CRED-03/04/05: whether one more attempt may be sent now. Every attempt
// takes a slot before it is sent, so a failure or an ambiguous timeout is
// counted like a success.
export function decideSlot(
  state: BudgetState,
  now: Date,
  today: string,
  callsPerDay: number,
): SlotDecision {
  if (isBefore(now, state.blockedUntil)) return { ok: false, reason: "blocked" };
  if (isBefore(now, state.coolDownUntil)) return { ok: false, reason: "cooling_down" };
  const used = state.day === today ? state.attempts : 0;
  if (used >= callsPerDay) return { ok: false, reason: "budget_exhausted" };
  return { ok: true, next: { ...state, day: today, attempts: used + 1 } };
}

// BR-CRED-05: about a second, ±25%. random is in [0, 1].
export function retryDelayMs(random: number): number {
  const spread = CREDIT_POLICY.retryDelayMs * CREDIT_POLICY.retryJitter;
  return Math.round(CREDIT_POLICY.retryDelayMs - spread + 2 * spread * random);
}
