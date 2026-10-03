import { and, asc, eq, gte, inArray, like, ne, or } from "drizzle-orm";
import type { AuditRecord } from "@/server/platform/audit";
import { auditEvents } from "@/server/platform/audit/schema";
import type { DbExecutor } from "@/server/platform/db";

// One case as plain English, for staff and reviewers: `pnpm audit:trail`
// and the demo panel both read it from here, so they can't disagree.
type Payload = Record<string, unknown>;

const REASONS: Record<string, string> = {
  repayment_near_limit: "repayments near the 40% limit",
  score_near_band_edge: "score near a band edge",
  amount_near_band_max: "amount near the band maximum",
  score_age: "score age",
};
const REFERRALS: Record<string, string> = {
  stale_score: "only an old score was available",
  no_credit_history: "no credit history",
  missing_bank_record: "income or repayments missing from the bank's record",
};

// gov.call never records the score itself, only what kind of answer came.
const GOV_OUTCOMES: Record<string, string> = {
  score: "score received",
  no_history: "no credit history",
  rate_limited: "refused, too many requests (429)",
  failure: "failed",
};

// Events that need no detail to be understood.
const PLAIN: Record<string, string> = {
  "auth.login_succeeded": "signed in",
  "auth.session_started": "session started",
  "auth.session_ended": "signed out",
  "auth.step_up_succeeded": "password re-entered (step-up)",
  "loan.applied": "application submitted by the customer",
  "kyc.draft_saved": "account-opening form saved",
  "kyc.application_pending": "account application sent, waiting for branch verification",
  "callback.requested": "call back requested",
  "demo.limit_reset": "demo: today's government limit reset",
  "demo.cache_cleared": "demo: credit cache cleared",
  "demo.customer_reset": "demo: the customer's demo data reset",
};

const lkr = (amount: unknown) => `LKR ${Number(amount).toLocaleString("en-US")}`;
const percent = (basisPoints: unknown) => `${Number(basisPoints) / 100}%`;
const days = (count: unknown) => (count === 1 ? "1 day" : `${String(count)} days`);
const clockTime = (iso: unknown) =>
  typeof iso === "string"
    ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : "later";

export const eventTime = (at: Date) => at.toLocaleTimeString("en-GB", { hour12: false });

function explainAssessment(p: Payload): string {
  const reasons = Array.isArray(p.confidenceReasons)
    ? (p.confidenceReasons as { code: string; penaltyBp: number }[])
        .map((r) => `${REASONS[r.code] ?? r.code} −${percent(r.penaltyBp)}`)
        .join(", ") || "nothing near an edge"
    : "reasons not recorded";
  const inputs =
    p.band === undefined
      ? ""
      : ` [band ${String(p.band)}, max ${lkr(p.maxAmountLkr)}, repayments ${percent(p.repaymentToIncomeBp)} of income]`;
  const rules = `rules say ${String(p.provisionalOutcome ?? p.outcome)}${inputs}`;
  const confidence =
    p.confidenceBp === null ? "" : ` → confidence ${percent(p.confidenceBp)} (${reasons})`;
  if (p.outcome === "referred") {
    const why =
      p.referralReason === "below_threshold"
        ? `below the ${percent(p.thresholdBp)} threshold`
        : (REFERRALS[String(p.referralReason)] ?? String(p.referralReason));
    return p.confidenceBp === null
      ? `assessed: ${why} → referred to a loan officer`
      : `assessed: ${rules}${confidence} → ${why} → referred to a loan officer`;
  }
  const ending =
    p.outcome === "eligible"
      ? "eligible, awaiting the customer's confirmation"
      : `not eligible (${String(p.ineligibleReason)})`;
  return `assessed: ${rules}${confidence} → at or above the ${percent(p.thresholdBp)} threshold → ${ending}`;
}

function explainCall(p: Payload): string {
  const count =
    p.callNumber === undefined
      ? ""
      : ` (call ${String(p.callNumber)} of ${String(p.callsPerDay)} today)`;
  const outcome = GOV_OUTCOMES[String(p.outcome)] ?? String(p.outcome);
  return `government credit service called${count}: ${outcome}${p.cause ? ` (${String(p.cause)})` : ""}`;
}

function explainSkip(p: Payload): string {
  const why: Record<string, string> = {
    budget_exhausted: `daily limit reached (${String(p.callsPerDay)} of ${String(p.callsPerDay)} used)`,
    blocked: `the service asked us to wait until ${clockTime(p.until)}`,
    cooling_down: `cooling down after a failure until ${clockTime(p.until)}`,
    no_nic: "no NIC on the customer's record",
    call_failed: "the call failed",
  };
  const served =
    p.servedStaleDays === null
      ? "no score to fall back on"
      : `stale score used, ${days(p.servedStaleDays)} old`;
  const lead = p.reason === "call_failed" ? "no fresh score" : "government call skipped";
  return `${lead}: ${why[String(p.reason)] ?? String(p.reason)} → ${served}`;
}

export function describeEvent(event: AuditRecord): string {
  const p = event.payload;
  switch (event.type) {
    case "auth.login_refused":
    case "auth.step_up_refused":
      return `${event.type === "auth.login_refused" ? "sign-in" : "step-up"} refused (${p.reason === "locked" ? "account locked" : "wrong password"})`;
    case "consent.given":
      return `consent given for a credit check: ${lkr(p.amountLkr)} over ${String(p.termMonths)} months`;
    case "gov.cache_hit":
      return `credit score served from cache, fetched ${days(p.ageDays)} ago: no government call`;
    case "gov.call":
      return explainCall(p);
    case "gov.call_skipped":
      return explainSkip(p);
    case "loan.assessed":
      return explainAssessment(p);
    case "agent.reply":
      return p.role === "triage"
        ? `triage routed the message to ${String(p.route)} [${event.model}, ${event.promptVersion}]`
        : `${String(p.role)} assistant replied${(p.toolCalls as string[]).length ? ` and called ${(p.toolCalls as string[]).join(", ")}` : ""} [${event.model}, ${event.promptVersion}]`;
    case "agent.tool_call":
      return `tool ${String(p.tool)} → ${String(p.label)}`;
    case "demo.failure_mode_set":
      return `demo: government service behaviour set to "${String(p.mode)}"`;
    case "demo.cache_aged":
      return `demo: every cached credit score made ${days(p.days)} older`;
    default:
      return PLAIN[event.type] ?? event.type;
  }
}

export type TimelineQuery = {
  conversationId: string | null;
  // Whose "reset my demo data" events belong in the case.
  customerId: string | null;
  // Demo events carry no conversation, so they're taken by time: from here
  // on, or else from the conversation's first event.
  since?: Date;
};

// A conversation's own events, those of the same requests that carry no
// conversation (sign-in, step-up), and the demo controls used meanwhile.
export function readTimeline(db: DbExecutor, query: TimelineQuery): AuditRecord[] {
  const ofConversation = query.conversationId
    ? or(
        eq(auditEvents.conversationId, query.conversationId),
        inArray(
          auditEvents.correlationId,
          db
            .selectDistinct({ id: auditEvents.correlationId })
            .from(auditEvents)
            .where(eq(auditEvents.conversationId, query.conversationId)),
        ),
      )
    : undefined;
  const own = ofConversation
    ? db.select().from(auditEvents).where(ofConversation).orderBy(asc(auditEvents.at)).all()
    : [];
  const since = query.since ?? own[0]?.at;
  if (!since) return own;
  const demo = db
    .select()
    .from(auditEvents)
    .where(
      and(
        like(auditEvents.type, "demo.%"),
        gte(auditEvents.at, since),
        or(
          ne(auditEvents.type, "demo.customer_reset"),
          eq(auditEvents.actor, query.customerId ?? ""),
        ),
      ),
    )
    .all();
  return [...own, ...demo].sort((a, b) => a.at.getTime() - b.at.getTime());
}
