import type { Clock } from "../clock";

export type RateLimiter = { take: (key: string) => boolean };

type RateLimiterOptions = { limit: number; windowMs: number; clock: Clock };

// In memory: the app runs as one instance (ARCHITECTURE §12), and losing
// the counts on a restart only gives a caller a fresh window. A shared
// store comes with a second instance.
export function createRateLimiter({ limit, windowMs, clock }: RateLimiterOptions): RateLimiter {
  const attempts = new Map<string, number[]>();
  return {
    take(key) {
      const nowMs = clock.now().getTime();
      const recent = (attempts.get(key) ?? []).filter((at) => nowMs - at < windowMs);
      const allowed = recent.length < limit;
      if (allowed) recent.push(nowMs);
      if (recent.length > 0) attempts.set(key, recent);
      else attempts.delete(key);
      return allowed;
    },
  };
}
