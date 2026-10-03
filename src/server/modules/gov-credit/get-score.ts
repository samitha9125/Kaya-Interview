import { nextSriLankaMidnight } from "@/server/platform/time";
import { blockUntil, budgetStatus, coolDownUntil, takeSlot } from "./budget";
import { findCachedScore, storeScore, type CachedScore } from "./cache";
import { CREDIT_POLICY } from "./config";
import { ageInDays, isFresh, isUsableStale, retryDelayMs, type SlotRefusal } from "./policy";
import type { BureauResult } from "./ports";
import type { GovCreditDeps, ScoreRequest, ScoreResult } from "./types";

type Attempt = BureauResult | { kind: "refused"; reason: SlotRefusal };

// Why no fresh score was had, as the audit records it.
type MissReason = SlotRefusal | "no_nic" | "call_failed";

// There is deliberately no way to force a refresh: while a fresh entry
// exists, nothing reaches the bureau (BR-CRED-07).
export async function getScore(request: ScoreRequest, deps: GovCreditDeps): Promise<ScoreResult> {
  const cached = findCachedScore(deps.db, request.customerId);
  const now = deps.clock.now();
  if (cached && isFresh(cached.fetchedAt, now, deps.cacheTtlDays)) {
    record("gov.cache_hit", request, deps, { ageDays: ageInDays(cached.fetchedAt, now) });
    return fromCache(cached, false);
  }
  const nic = deps.loadNic(request.customerId);
  if (!nic) return staleOr(cached, "no_nic", request, deps);
  let outcome = await attempt(nic, 1, request, deps);
  if (outcome.kind === "failure" && outcome.isRetryable) {
    await deps.sleep(retryDelayMs(deps.random()));
    outcome = await attempt(nic, 2, request, deps);
  }
  return settle(outcome, cached, request, deps);
}

// A slot is taken before every attempt, so each one is counted whether it
// succeeds, fails or times out (BR-CRED-03).
async function attempt(
  nic: string,
  number: number,
  request: ScoreRequest,
  deps: GovCreditDeps,
): Promise<Attempt> {
  const slot = takeSlot(deps.db, deps.clock.now(), deps.bureau.callsPerDay);
  if (!slot.ok) return { kind: "refused", reason: slot.reason };
  const result = await deps.bureau.fetchScore(nic);
  record("gov.call", request, deps, {
    attempt: number,
    callNumber: slot.next.attempts,
    callsPerDay: deps.bureau.callsPerDay,
    outcome: result.kind,
    ...(result.kind === "failure" ? { cause: result.cause } : {}),
  });
  return result;
}

function settle(
  outcome: Attempt,
  cached: CachedScore | undefined,
  request: ScoreRequest,
  deps: GovCreditDeps,
): ScoreResult {
  const now = deps.clock.now();
  switch (outcome.kind) {
    case "score":
    case "no_history": {
      const score = outcome.kind === "score" ? outcome.score : null;
      return fromCache(
        storeScore(deps.db, { customerId: request.customerId, score, fetchedAt: now }),
        false,
      );
    }
    case "rate_limited":
      // BR-CRED-04: no calls until Retry-After, or else the next window.
      blockUntil(deps.db, outcome.retryAfter ?? nextSriLankaMidnight(now), now);
      return staleOr(cached, "blocked", request, deps);
    case "failure":
      if (outcome.isRetryable) {
        coolDownUntil(deps.db, new Date(now.getTime() + CREDIT_POLICY.coolDownMs), now);
      }
      return staleOr(cached, "call_failed", request, deps);
    case "refused":
      return staleOr(cached, outcome.reason, request, deps);
  }
}

// BR-CRED-02: when no fresh call is possible, a score up to 90 days old
// stands in, marked stale (and so always referred, BR-LEND-06).
function staleOr(
  cached: CachedScore | undefined,
  why: MissReason,
  request: ScoreRequest,
  deps: GovCreditDeps,
): ScoreResult {
  const now = deps.clock.now();
  const usable = cached && isUsableStale(cached.fetchedAt, now) ? cached : undefined;
  record("gov.call_skipped", request, deps, {
    reason: why,
    ...missDetail(why, deps, now),
    servedStaleDays: usable ? ageInDays(usable.fetchedAt, now) : null,
  });
  if (usable) return fromCache(usable, true);
  return { ok: false, reason: why === "no_nic" || why === "call_failed" ? "unavailable" : why };
}

// When the block or cool-down ends, or how many calls the day allows, so
// the audit says "blocked until 14:00" rather than just "blocked".
function missDetail(why: MissReason, deps: GovCreditDeps, now: Date): Record<string, unknown> {
  const status = budgetStatus(deps.db, now);
  if (why === "blocked") return { until: status.blockedUntil?.toISOString() };
  if (why === "cooling_down") return { until: status.coolDownUntil?.toISOString() };
  if (why === "budget_exhausted") return { callsPerDay: deps.bureau.callsPerDay };
  return {};
}

// Never the score itself: only what happened and when.
function record(
  type: string,
  request: ScoreRequest,
  deps: GovCreditDeps,
  detail: Record<string, unknown>,
): void {
  deps.audit.record(deps.db, {
    type,
    correlationId: request.correlationId,
    conversationId: request.conversationId,
    actor: "system",
    payload: { customerId: request.customerId, ...detail },
  });
}

function fromCache(entry: CachedScore, stale: boolean): ScoreResult {
  return {
    ok: true,
    score: entry.score,
    hasHistory: entry.hasHistory,
    fetchedAt: entry.fetchedAt,
    stale,
  };
}
