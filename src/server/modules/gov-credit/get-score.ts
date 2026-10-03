import { nextSriLankaMidnight } from "@/server/platform/time";
import { blockUntil, coolDownUntil, takeSlot } from "./budget";
import { findCachedScore, storeScore, type CachedScore } from "./cache";
import { CREDIT_POLICY } from "./config";
import { isFresh, isUsableStale, retryDelayMs, type SlotRefusal } from "./policy";
import type { BureauResult } from "./ports";
import type { GovCreditDeps, ScoreFailureReason, ScoreRequest, ScoreResult } from "./types";

type Attempt = BureauResult | { kind: "refused"; reason: SlotRefusal };

// There is deliberately no way to force a refresh: while a fresh entry
// exists, nothing reaches the bureau (BR-CRED-07).
export async function getScore(request: ScoreRequest, deps: GovCreditDeps): Promise<ScoreResult> {
  const cached = findCachedScore(deps.db, request.customerId);
  if (cached && isFresh(cached.fetchedAt, deps.clock.now(), deps.cacheTtlDays)) {
    return fromCache(cached, false);
  }
  const nic = deps.loadNic(request.customerId);
  if (!nic) return staleOr(cached, "unavailable", deps);
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
  deps.audit.record(deps.db, {
    type: "gov.call",
    correlationId: request.correlationId,
    conversationId: request.conversationId,
    actor: "system",
    payload: {
      customerId: request.customerId,
      attempt: number,
      outcome: result.kind,
      ...(result.kind === "failure" ? { cause: result.cause } : {}),
    },
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
      return staleOr(cached, "blocked", deps);
    case "failure":
      if (outcome.isRetryable) {
        coolDownUntil(deps.db, new Date(now.getTime() + CREDIT_POLICY.coolDownMs), now);
      }
      return staleOr(cached, "unavailable", deps);
    case "refused":
      return staleOr(cached, outcome.reason, deps);
  }
}

// BR-CRED-02: when no fresh call is possible, a score up to 90 days old
// stands in, marked stale (and so always referred, BR-LEND-06).
function staleOr(
  cached: CachedScore | undefined,
  reason: ScoreFailureReason,
  deps: GovCreditDeps,
): ScoreResult {
  if (cached && isUsableStale(cached.fetchedAt, deps.clock.now())) return fromCache(cached, true);
  return { ok: false, reason };
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
