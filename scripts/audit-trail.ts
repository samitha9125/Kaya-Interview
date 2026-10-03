import BetterSqlite3 from "better-sqlite3";
import { asc, desc, eq, inArray, like, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { conversations } from "@/server/agent/conversations/schema";
import { customers } from "@/server/modules/auth/schema";
import { auditEvents } from "@/server/platform/audit/schema";
import { ConfigError, getConfig } from "@/server/platform/config";

// `pnpm audit:trail <customer number | conversation ID | reference code>`:
// one case as a plain-English timeline, for staff and reviewers (B10: the
// audit is never shown in the app). Read-only, so it can run beside the
// server. A customer number shows their latest conversation.
type Event = typeof auditEvents.$inferSelect;
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
  failure: "failed",
};

// Events that need no detail to be understood.
const PLAIN: Record<string, string> = {
  "auth.login_succeeded": "signed in",
  "auth.login_refused": "sign-in refused",
  "auth.session_started": "session started",
  "auth.session_ended": "signed out",
  "auth.step_up_succeeded": "password re-entered (step-up)",
  "auth.step_up_failed": "step-up password wrong",
  "loan.applied": "application submitted by the customer",
  "kyc.draft_saved": "account-opening form saved",
  "kyc.application_pending": "account application sent, waiting for branch verification",
  "callback.requested": "call back requested",
};

const lkr = (amount: unknown) => `LKR ${Number(amount).toLocaleString("en-US")}`;
const percent = (basisPoints: unknown) => `${Number(basisPoints) / 100}%`;
const time = (at: Date) => at.toLocaleTimeString("en-GB", { hour12: false });

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

function describe(event: Event): string {
  const p = event.payload;
  switch (event.type) {
    case "consent.given":
      return `consent given for a credit check: ${lkr(p.amountLkr)} over ${String(p.termMonths)} months`;
    case "gov.call":
      return `government credit service called: ${GOV_OUTCOMES[String(p.outcome)] ?? String(p.outcome)}${p.cause ? ` (${String(p.cause)})` : ""}`;
    case "loan.assessed":
      return explainAssessment(p);
    case "agent.reply":
      return p.role === "triage"
        ? `triage routed the message to ${String(p.route)} [${event.model}, ${event.promptVersion}]`
        : `${String(p.role)} assistant replied${(p.toolCalls as string[]).length ? ` and called ${(p.toolCalls as string[]).join(", ")}` : ""} [${event.model}, ${event.promptVersion}]`;
    case "agent.tool_call":
      return `tool ${String(p.tool)} → ${String(p.label)}`;
    default:
      return PLAIN[event.type] ?? event.type;
  }
}

function fail(message: string) {
  console.error(message);
  process.exitCode = 1;
}

function main() {
  const [query] = process.argv.slice(2);
  if (!query)
    return fail("Usage: pnpm audit:trail <customer number | conversation ID | reference code>");
  const sqlite = new BetterSqlite3(getConfig().DATABASE_PATH, {
    readonly: true,
    fileMustExist: true,
  });
  const db = drizzle(sqlite);
  let conversationId: string | undefined = query;
  if (/^C\d+$/i.test(query)) {
    const customer = db
      .select()
      .from(customers)
      .where(eq(customers.customerNumber, query.toUpperCase()))
      .get();
    conversationId = customer
      ? db
          .select()
          .from(conversations)
          .where(eq(conversations.customerId, customer.id))
          .orderBy(desc(conversations.createdAt))
          .get()?.id
      : undefined;
    if (!conversationId) return fail(`No conversation found for ${query}.`);
  }
  // A conversation's own events, plus those of the same requests that
  // carry no conversation (sign-in, step-up). Otherwise a reference code,
  // the first characters of a request's correlation ID.
  const ofConversation = db
    .selectDistinct({ id: auditEvents.correlationId })
    .from(auditEvents)
    .where(eq(auditEvents.conversationId, conversationId))
    .all()
    .map((row) => row.id);
  const where = ofConversation.length
    ? or(
        eq(auditEvents.conversationId, conversationId),
        inArray(auditEvents.correlationId, ofConversation),
      )
    : like(auditEvents.correlationId, `${query.toUpperCase()}%`);
  const events = db.select().from(auditEvents).where(where).orderBy(asc(auditEvents.at)).all();
  sqlite.close();
  if (!events.length) return fail(`Nothing in the audit trail for ${query}.`);
  const first = events[0]?.at ?? new Date();
  console.log(
    `Audit trail for ${query}, ${first.toLocaleDateString("en-GB", { dateStyle: "medium" })} (local time)`,
  );
  for (const event of events) console.log(`${time(event.at)}  ${describe(event)}`);
}

try {
  main();
} catch (error) {
  fail(error instanceof ConfigError ? error.message : String(error));
}
