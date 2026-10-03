import {
  findOwnedConversation,
  type ConversationDeps,
} from "@/server/agent/conversations/ownership";
import type { Session } from "@/server/modules/auth";
import { failureResponse } from "./failures";
import type { TurnLock } from "./turn-lock";

type TurnRequest = { conversationId: string; session: Session; correlationId: string };

// FR-AUTH-06 and FR-WEB-03 for every route that runs or resumes a turn:
// someone else's conversation is a 404, a turn already running is a 409,
// and the lock is released however the turn ends.
export async function withConversationTurn(
  { conversationId, session, correlationId }: TurnRequest,
  deps: ConversationDeps & { turnLock: TurnLock },
  turn: () => Promise<Response>,
): Promise<Response> {
  if (!findOwnedConversation(conversationId, session, deps)) {
    return failureResponse("not_found", correlationId);
  }
  const release = deps.turnLock.acquire(conversationId);
  if (!release) return failureResponse("turn_in_progress", correlationId);
  try {
    return await turn();
  } finally {
    release();
  }
}
