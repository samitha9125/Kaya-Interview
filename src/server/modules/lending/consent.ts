import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { writeWithAudit } from "@/server/platform/audit";
import type { DbExecutor } from "@/server/platform/db";
import { PRODUCT } from "./config";
import { consents } from "./schema";
import type { LendingDeps, LoanContext } from "./types";

// SPEC A2. The agent validates the LLM's tool arguments with this same
// schema (FR-AGT-02); the module checks again at its own boundary.
export const LoanTerms = z.object({
  amountLkr: z.int().min(PRODUCT.minAmountLkr).max(PRODUCT.maxAmountLkr),
  termMonths: z.int().min(PRODUCT.minTermMonths).max(PRODUCT.maxTermMonths),
});
export type LoanTerms = z.infer<typeof LoanTerms>;

export type ConsentResult =
  { ok: true; consentId: string } | { ok: false; reason: "invalid_terms" };

type ConsentDeps = Pick<LendingDeps, "db" | "audit" | "clock" | "ids">;

// BR-LEND-07: called by the route handler when the customer agrees on the
// consent card. The graph only ever receives the returned ID.
export function recordConsent(request: LoanContext & LoanTerms, deps: ConsentDeps): ConsentResult {
  const terms = LoanTerms.safeParse(request);
  if (!terms.success) return { ok: false, reason: "invalid_terms" };
  const consent = {
    id: deps.ids.newId(),
    customerId: request.customerId,
    conversationId: request.conversationId,
    ...terms.data,
    givenAt: deps.clock.now(),
  };
  return writeWithAudit(deps.db, deps.audit, (tx) => {
    tx.insert(consents).values(consent).run();
    return {
      result: { ok: true, consentId: consent.id },
      event: {
        type: "consent.given",
        correlationId: request.correlationId,
        conversationId: request.conversationId,
        actor: request.customerId,
        payload: { consentId: consent.id, purpose: "credit_check", ...terms.data },
      },
    };
  });
}

// A consent counts only for the customer and conversation it was given in.
export function findConsent(executor: DbExecutor, consentId: string, context: LoanContext) {
  return executor
    .select()
    .from(consents)
    .where(
      and(
        eq(consents.id, consentId),
        eq(consents.customerId, context.customerId),
        eq(consents.conversationId, context.conversationId),
      ),
    )
    .get();
}
