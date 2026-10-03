import { inArray } from "drizzle-orm";
import type { DbExecutor } from "@/server/platform/db";
import { kycApplications } from "./schema";

// Demo only: account applications belong to a conversation, so a
// customer's are cleared by the conversations being reset.
export function deleteKycApplications(executor: DbExecutor, conversationIds: string[]): void {
  if (conversationIds.length === 0) return;
  executor
    .delete(kycApplications)
    .where(inArray(kycApplications.conversationId, conversationIds))
    .run();
}
