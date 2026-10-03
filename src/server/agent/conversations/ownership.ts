import { and, eq, isNull } from "drizzle-orm";
import type { Session } from "@/server/modules/auth";
import type { Clock } from "@/server/platform/clock";
import type { AppDatabase } from "@/server/platform/db";
import type { IdGenerator } from "@/server/platform/ids";
import { conversations } from "./schema";

export type ConversationDeps = { db: AppDatabase; clock: Clock; ids: IdGenerator };

export type Conversation = typeof conversations.$inferSelect;

export function startConversation(owner: Session, deps: ConversationDeps): string {
  const id = deps.ids.newId();
  deps.db
    .insert(conversations)
    .values({
      id,
      customerId: owner.customerId,
      guestSessionId: owner.customerId ? null : owner.id,
      createdAt: deps.clock.now(),
    })
    .run();
  return id;
}

// One lookup for "not yours" and "doesn't exist", so the harness answers
// both with the same 404 and an ID reveals nothing (P0-04).
export function findOwnedConversation(
  id: string,
  reader: Session,
  deps: ConversationDeps,
): Conversation | undefined {
  const ownedByReader = reader.customerId
    ? eq(conversations.customerId, reader.customerId)
    : and(isNull(conversations.customerId), eq(conversations.guestSessionId, reader.id));
  return deps.db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), ownedByReader))
    .get();
}
