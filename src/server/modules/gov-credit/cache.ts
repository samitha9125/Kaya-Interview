import { eq } from "drizzle-orm";
import type { AppDatabase } from "@/server/platform/db";
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
