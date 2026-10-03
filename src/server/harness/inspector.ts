import { findOwnedConversation } from "@/server/agent/conversations/ownership";
import { resolveSession, type Session, type SessionDeps } from "@/server/modules/auth";
import {
  budgetStatus,
  cachedScoreStatus,
  type CachedScoreStatus,
  type GovCreditDeps,
} from "@/server/modules/gov-credit";
import { newCorrelationId } from "@/server/platform/ids";
import type { Logger } from "@/server/platform/logger";
import { currentFailureMode, describeEvent, readTimeline } from "./audit-timeline";
import { failureResponse } from "./failures";
import { readSessionToken } from "./http/session-cookie";

export type InspectorDeps = SessionDeps & {
  config: { DEMO_MODE: boolean };
  credit: Pick<GovCreditDeps, "db" | "clock" | "cacheTtlDays" | "bureau">;
  logger: Logger;
};

export type ServiceStatus =
  { kind: "available" } | { kind: "blocked" | "cooling_down"; until: string };

// The demo panel's data: service-wide counters, and only the signed-in
// visitor's own case. Never a score: the cache entry shows its age only.
export type InspectorView = {
  service: {
    usedToday: number;
    perDay: number;
    cacheTtlDays: number;
    status: ServiceStatus;
    failureMode: string;
  };
  cachedScore: CachedScoreStatus | null;
  timeline: { id: string; at: string; text: string }[];
};

// BR-SET-01: like the other demo routes, it doesn't exist outside demo
// mode. A read, so no idempotency key; ownership is checked as for a chat
// turn (P0-04), with one 404 for "not yours" and "doesn't exist".
export async function getInspector(request: Request, deps: InspectorDeps): Promise<Response> {
  if (!deps.config.DEMO_MODE) return new Response(null, { status: 404 });
  const correlationId = newCorrelationId();
  try {
    const token = readSessionToken(request);
    const resolved = token ? resolveSession(token, deps) : undefined;
    if (!resolved?.ok) return failureResponse("not_signed_in", correlationId);
    const conversationId = new URL(request.url).searchParams.get("conversationId");
    if (conversationId && !findOwnedConversation(conversationId, resolved.session, deps)) {
      return failureResponse("not_found", correlationId);
    }
    const view = readInspector(resolved.session, conversationId, deps);
    return Response.json(view, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    deps.logger.error("request failed", { correlationId, error });
    return failureResponse("internal", correlationId);
  }
}

function readInspector(
  session: Session,
  conversationId: string | null,
  deps: InspectorDeps,
): InspectorView {
  const now = deps.credit.clock.now();
  const budget = budgetStatus(deps.credit.db, now);
  const timeline = readTimeline(deps.db, {
    conversationId,
    customerId: session.customerId,
    since: session.startedAt,
  });
  return {
    service: {
      usedToday: budget.usedToday,
      perDay: deps.credit.bureau.callsPerDay,
      cacheTtlDays: deps.credit.cacheTtlDays,
      status: budget.blockedUntil
        ? { kind: "blocked", until: budget.blockedUntil.toISOString() }
        : budget.coolDownUntil
          ? { kind: "cooling_down", until: budget.coolDownUntil.toISOString() }
          : { kind: "available" },
      failureMode: currentFailureMode(deps.db),
    },
    cachedScore: session.customerId
      ? cachedScoreStatus(deps.credit.db, session.customerId, now, deps.credit.cacheTtlDays)
      : null,
    timeline: timeline.map((event) => ({
      id: event.id,
      at: event.at.toISOString(),
      text: describeEvent(event),
    })),
  };
}
