import { and, eq } from "drizzle-orm";
import type { z } from "zod";
import type { Clock } from "../clock";
import { runInTransaction, type AppDatabase, type DbExecutor } from "../db";
import { idempotencyKeys } from "./schema";

export type OnceRequest<T> = { scope: string; key: string; resultSchema: z.ZodType<T> };
export type OnceResult<T> = { result: T; isReplay: boolean };
export type Idempotency = {
  runOnce: <T>(request: OnceRequest<T>, work: (tx: DbExecutor) => T) => OnceResult<T>;
};

// FR-PLAT-05: the work, its side effects and the stored key share one
// transaction. If the work fails, nothing is kept and a retry runs it again.
export function createIdempotency({ db, clock }: { db: AppDatabase; clock: Clock }): Idempotency {
  return {
    runOnce: ({ scope, key, resultSchema }, work) =>
      runInTransaction(db, (tx) => {
        const stored = tx
          .select({ result: idempotencyKeys.result })
          .from(idempotencyKeys)
          .where(and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key)))
          .get();
        if (stored) return { result: resultSchema.parse(stored.result), isReplay: true };
        const result = work(tx);
        tx.insert(idempotencyKeys).values({ scope, key, result, createdAt: clock.now() }).run();
        return { result, isReplay: false };
      }),
  };
}
