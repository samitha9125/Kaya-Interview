import { createAuditLog } from "@/server/platform/audit";
import { createTestDatabase } from "@/test/database";
import { movableClock, sequentialIds } from "@/test/fakes";
import type { CreditBureau, GovCreditDeps } from "@/server/modules/gov-credit";

// Made-up NIC. secret-scan:ignore
export const CUSTOMER_NIC = "199012345678";
export const DAY = 24 * 60 * 60_000;

// Real in-memory SQLite and a hand-moved clock; sleep and randomness are
// recorded and fixed, so retries run without real timers.
export function creditTestSetup(bureau: CreditBureau) {
  const handle = createTestDatabase();
  const time = movableClock("2026-10-03T04:30:00.000Z"); // 10:00 in Colombo
  const slept: number[] = [];
  const deps: GovCreditDeps = {
    db: handle.db,
    audit: createAuditLog({ clock: time.clock, ids: sequentialIds("audit") }),
    clock: time.clock,
    bureau,
    cacheTtlDays: 30,
    loadNic: () => CUSTOMER_NIC,
    sleep: async (ms) => void slept.push(ms),
    random: () => 0.5,
  };
  return { handle, deps, slept, advance: time.advance };
}

export const request = (customerId = "customer-a") => ({ customerId, correlationId: "corr-1" });
