import BetterSqlite3 from "better-sqlite3";
import { asc, desc, eq, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { conversations } from "@/server/agent/conversations/schema";
import { describeEvent, eventTime, readTimeline } from "@/server/harness/audit-timeline";
import { customers } from "@/server/modules/auth/schema";
import { auditEvents } from "@/server/platform/audit/schema";
import { ConfigError, getConfig } from "@/server/platform/config";

// `pnpm audit:trail <customer number | conversation ID | reference code>`:
// one case as a plain-English timeline, for staff and reviewers (B10: the
// audit is never shown to customers). Read-only, so it can run beside the
// server. A customer number shows their latest conversation.
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
  // A conversation's case, or else a reference code: the first characters
  // of a request's correlation ID.
  const owner = db
    .select({ customerId: conversations.customerId })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .get();
  const ofCase = readTimeline(db, { conversationId, customerId: owner?.customerId ?? null });
  const events = ofCase.length
    ? ofCase
    : db
        .select()
        .from(auditEvents)
        .where(like(auditEvents.correlationId, `${query.toUpperCase()}%`))
        .orderBy(asc(auditEvents.at))
        .all();
  sqlite.close();
  if (!events.length) return fail(`Nothing in the audit trail for ${query}.`);
  const first = events[0]?.at ?? new Date();
  console.log(
    `Audit trail for ${query}, ${first.toLocaleDateString("en-GB", { dateStyle: "medium" })} (local time)`,
  );
  for (const event of events) console.log(`${eventTime(event.at)}  ${describeEvent(event)}`);
}

try {
  main();
} catch (error) {
  fail(error instanceof ConfigError ? error.message : String(error));
}
