import { eq } from "drizzle-orm";
import { runInTransaction, type AppDatabase, type DbExecutor } from "@/server/platform/db";
import { sriLankaDay } from "@/server/platform/time";
import { decideSlot, type BudgetState, type SlotDecision } from "./policy";
import { govApiBudget } from "./schema";

const ROW = 1;

function readState(tx: DbExecutor, today: string): BudgetState {
  const row = tx.select().from(govApiBudget).where(eq(govApiBudget.id, ROW)).get();
  return row ?? { day: today, attempts: 0, blockedUntil: null, coolDownUntil: null };
}

function writeState(tx: DbExecutor, state: BudgetState): void {
  tx.insert(govApiBudget)
    .values({ id: ROW, ...state })
    .onConflictDoUpdate({ target: govApiBudget.id, set: state })
    .run();
}

// FR-CRED-01: read, decide and write in one IMMEDIATE transaction, which
// holds SQLite's write lock throughout, so two requests racing for the
// last slot can't both take it.
export function takeSlot(db: AppDatabase, now: Date, callsPerDay: number): SlotDecision {
  return runInTransaction(db, (tx) => {
    const today = sriLankaDay(now);
    const decision = decideSlot(readState(tx, today), now, today, callsPerDay);
    if (decision.ok) writeState(tx, decision.next);
    return decision;
  });
}

export function blockUntil(db: AppDatabase, until: Date, now: Date): void {
  runInTransaction(db, (tx) =>
    writeState(tx, { ...readState(tx, sriLankaDay(now)), blockedUntil: until }),
  );
}

export function coolDownUntil(db: AppDatabase, until: Date, now: Date): void {
  runInTransaction(db, (tx) =>
    writeState(tx, { ...readState(tx, sriLankaDay(now)), coolDownUntil: until }),
  );
}

// For the Settings screen: attempts made in today's Sri Lanka window.
export function attemptsToday(db: AppDatabase, now: Date): number {
  const today = sriLankaDay(now);
  const state = readState(db, today);
  return state.day === today ? state.attempts : 0;
}

// FR-SET-04: the demo control clears today's count, the block and the
// cool-down, so a fresh check is allowed again.
export function resetBudget(db: AppDatabase, now: Date): void {
  runInTransaction(db, (tx) =>
    writeState(tx, { day: sriLankaDay(now), attempts: 0, blockedUntil: null, coolDownUntil: null }),
  );
}
