import { and, desc, eq, gte, isNull } from "drizzle-orm";
import type { Session } from "@/server/modules/auth";
import type { ModelSelection } from "@/server/modules/settings";
import type { Clock } from "@/server/platform/clock";
import type { AppDatabase } from "@/server/platform/db";
import type { IdGenerator } from "@/server/platform/ids";
import { conversations } from "./schema";

export type ConversationDeps = { db: AppDatabase; clock: Clock; ids: IdGenerator };

export type Conversation = typeof conversations.$inferSelect;

export function startConversation(
  owner: Session,
  models: ModelSelection,
  deps: ConversationDeps,
): string {
  const id = deps.ids.newId();
  deps.db
    .insert(conversations)
    .values({
      id,
      customerId: owner.customerId,
      guestSessionId: owner.customerId ? null : owner.id,
      models,
      createdAt: deps.clock.now(),
    })
    .run();
  return id;
}

function ownedBy(reader: Session) {
  return reader.customerId
    ? eq(conversations.customerId, reader.customerId)
    : and(isNull(conversations.customerId), eq(conversations.guestSessionId, reader.id));
}

// One lookup for "not yours" and "doesn't exist", so the harness answers
// both with the same 404 and an ID reveals nothing (P0-04).
export function findOwnedConversation(
  id: string,
  reader: Session,
  deps: ConversationDeps,
): Conversation | undefined {
  return deps.db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), ownedBy(reader)))
    .get();
}

// P1-11: a reload picks up the latest conversation of this sign-in; a new
// sign-in starts with an empty chat. Earlier conversations stay in the
// database and the audit log.
export function findCurrentConversation(
  reader: Session,
  deps: ConversationDeps,
): Conversation | undefined {
  return deps.db
    .select()
    .from(conversations)
    .where(and(ownedBy(reader), gte(conversations.createdAt, reader.startedAt)))
    .orderBy(desc(conversations.createdAt))
    .limit(1)
    .get();
}
