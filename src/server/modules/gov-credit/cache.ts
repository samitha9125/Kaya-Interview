import { eq, sql } from "drizzle-orm";
import type { AppDatabase } from "@/server/platform/db";
import { DAY_MS, DEMO_CACHE_AGE_DAYS } from "./config";
import { ageInDays, cacheState, type CacheState } from "./policy";
import { creditScoreCache } from "./schema";

export type CachedScore = typeof creditScoreCache.$inferSelect;

export function findCachedScore(db: AppDatabase, customerId: string): CachedScore | undefined {
  return db
    .select()
    .from(creditScoreCache)
    .where(eq(creditScoreCache.customerId, customerId))
    .get();
}

// FR-CRED-03: each fetch records whether the score changed since the last.
export function storeScore(
  db: AppDatabase,
  entry: { customerId: string; score: number | null; fetchedAt: Date },
): CachedScore {
  const previous = findCachedScore(db, entry.customerId);
  const row: CachedScore = {
    ...entry,
    hasHistory: entry.score !== null,
    scoreChanged: previous ? previous.score !== entry.score : null,
  };
  db.insert(creditScoreCache)
    .values(row)
    .onConflictDoUpdate({ target: creditScoreCache.customerId, set: row })
    .run();
  return row;
}

// FR-SET-05: the demo control.
export function clearScoreCache(db: AppDatabase): void {
  db.delete(creditScoreCache).run();
}

// Demo only: every cached score becomes 31 days older, so the lifetime and
// the stale window can be shown without waiting.
export function ageScoreCache(db: AppDatabase): void {
  const byMs = DEMO_CACHE_AGE_DAYS * DAY_MS;
  db.update(creditScoreCache)
    .set({ fetchedAt: sql`${creditScoreCache.fetchedAt} - ${byMs}` })
    .run();
}

// The demo panel's view of one customer's entry: its age and state, never
// the score.
export type CachedScoreStatus = { state: CacheState; ageDays: number } | { state: "none" };

export function cachedScoreStatus(
  db: AppDatabase,
  customerId: string,
  now: Date,
  ttlDays: number,
): CachedScoreStatus {
  const entry = findCachedScore(db, customerId);
  if (!entry) return { state: "none" };
  return {
    state: cacheState(entry.fetchedAt, now, ttlDays),
    ageDays: ageInDays(entry.fetchedAt, now),
  };
}
