import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Clock } from "@/server/platform/clock";
import { hashToken, secretsMatch } from "@/server/platform/crypto";
import { runInTransaction, type AppDatabase, type DbExecutor } from "@/server/platform/db";
import { nextSriLankaMidnight, sriLankaDay } from "@/server/platform/time";
import { mockGovCitizens, mockGovIpCalls, mockGovSettings } from "./schema";

export const FAILURE_MODES = ["normal", "slow", "error", "rate_limited", "down"] as const;
export type FailureMode = (typeof FAILURE_MODES)[number];

// FR-MOCK-02 and FR-MOCK-03: the real service's published limits, and a
// "slow" that sits beyond our 5-second timeout.
export const MOCK_GOV_POLICY = {
  callsPerIpPerDay: 5,
  slowDelayMs: 6_000,
  rateLimitedRetryAfterSeconds: 3_600,
} as const;

export type MockGovDeps = {
  db: AppDatabase;
  clock: Clock;
  sleep: (ms: number) => Promise<void>;
  isDemoMode: boolean;
  apiKey: string;
};

const CreditScoreRequest = z.strictObject({ nic: z.string().trim().min(10).max(14) });
const FailureModeRequest = z.strictObject({ mode: z.enum(FAILURE_MODES) });

const nicKey = (nic: string) => hashToken(nic.replace(/[\s-]/g, "").toUpperCase());

export function registerCitizen(executor: DbExecutor, nic: string, score: number | null): void {
  executor
    .insert(mockGovCitizens)
    .values({ nicHash: nicKey(nic), score })
    .onConflictDoUpdate({ target: mockGovCitizens.nicHash, set: { score } })
    .run();
}

// FR-MOCK-01: 200 with a score, or 404 for no credit history. Nothing
// else about the person, and nothing about future evaluations, is ever
// returned. Like a real government API, it answers only the key it issued
// the bank, so nobody else can spend the bank's daily calls. A service
// that is down can't count calls, so "down" answers next; every call that
// reaches it counts toward the IP's daily limit.
export async function creditScore(request: Request, deps: MockGovDeps): Promise<Response> {
  if (!secretsMatch(request.headers.get("x-api-key") ?? "", deps.apiKey)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const mode = currentFailureMode(deps.db);
  if (mode === "down") return new Response(null, { status: 503 });
  const now = deps.clock.now();
  if (countCall(deps.db, callerIp(request), sriLankaDay(now)) > MOCK_GOV_POLICY.callsPerIpPerDay) {
    return tooManyRequests(
      Math.ceil((nextSriLankaMidnight(now).getTime() - now.getTime()) / 1_000),
    );
  }
  if (mode === "error") return Response.json({ error: "internal_error" }, { status: 500 });
  if (mode === "rate_limited") return tooManyRequests(MOCK_GOV_POLICY.rateLimitedRetryAfterSeconds);
  if (mode === "slow") await deps.sleep(MOCK_GOV_POLICY.slowDelayMs);
  const parsed = CreditScoreRequest.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });
  const citizen = deps.db
    .select({ score: mockGovCitizens.score })
    .from(mockGovCitizens)
    .where(eq(mockGovCitizens.nicHash, nicKey(parsed.data.nic)))
    .get();
  if (!citizen || citizen.score === null) {
    return Response.json({ error: "no_credit_history" }, { status: 404 });
  }
  return Response.json({ score: citizen.score });
}

// FR-MOCK-04: the admin controls exist only in demo mode; otherwise they
// are indistinguishable from a route that isn't there.
export function resetDailyLimit(_request: Request, deps: MockGovDeps): Response {
  if (!deps.isDemoMode) return new Response(null, { status: 404 });
  deps.db
    .delete(mockGovIpCalls)
    .where(eq(mockGovIpCalls.day, sriLankaDay(deps.clock.now())))
    .run();
  return Response.json({ ok: true });
}

export async function setFailureMode(request: Request, deps: MockGovDeps): Promise<Response> {
  if (!deps.isDemoMode) return new Response(null, { status: 404 });
  const parsed = FailureModeRequest.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });
  deps.db
    .insert(mockGovSettings)
    .values({ id: 1, failureMode: parsed.data.mode })
    .onConflictDoUpdate({ target: mockGovSettings.id, set: { failureMode: parsed.data.mode } })
    .run();
  return Response.json({ ok: true, mode: parsed.data.mode });
}

export function currentFailureMode(db: AppDatabase): FailureMode {
  const row = db.select().from(mockGovSettings).where(eq(mockGovSettings.id, 1)).get();
  return FAILURE_MODES.find((mode) => mode === row?.failureMode) ?? "normal";
}

function countCall(db: AppDatabase, ip: string, day: string): number {
  return runInTransaction(db, (tx) => {
    tx.insert(mockGovIpCalls)
      .values({ ip, day, calls: 1 })
      .onConflictDoUpdate({
        target: [mockGovIpCalls.ip, mockGovIpCalls.day],
        set: { calls: sql`${mockGovIpCalls.calls} + 1` },
      })
      .run();
    const row = tx
      .select({ calls: mockGovIpCalls.calls })
      .from(mockGovIpCalls)
      .where(and(eq(mockGovIpCalls.ip, ip), eq(mockGovIpCalls.day, day)))
      .get();
    return row?.calls ?? 0;
  });
}

function callerIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function tooManyRequests(retryAfterSeconds: number): Response {
  return Response.json(
    { error: "rate_limited" },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}
