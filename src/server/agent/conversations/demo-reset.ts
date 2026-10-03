import { eq, inArray, or } from "drizzle-orm";
import type { DbExecutor } from "@/server/platform/db";
import { callbackRequests } from "../callbacks/schema";
import { conversations } from "./schema";

// Demo only: a customer's conversations and call-back requests. Returns
// the conversation IDs, which are also the checkpointer's thread IDs.
export function deleteCustomerConversations(executor: DbExecutor, customerId: string): string[] {
  const ids = executor
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.customerId, customerId))
    .all()
    .map((row) => row.id);
  executor
    .delete(callbackRequests)
    .where(
      ids.length
        ? or(
            eq(callbackRequests.customerId, customerId),
            inArray(callbackRequests.conversationId, ids),
          )
        : eq(callbackRequests.customerId, customerId),
    )
    .run();
  executor.delete(conversations).where(eq(conversations.customerId, customerId)).run();
  return ids;
}
