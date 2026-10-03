import {
  findOwnedConversation,
  type Conversation,
  type ConversationDeps,
} from "@/server/agent/conversations/ownership";
import type { Session } from "@/server/modules/auth";
import { failureResponse } from "./failures";
import type { TurnLock } from "./turn-lock";

type TurnRequest = { conversationId: string; session: Session; correlationId: string };

// FR-AUTH-06 and FR-WEB-03 for every route that runs or resumes a turn:
// someone else's conversation is a 404 and a turn already running is a
// 409. The lock is held for as long as the turn runs: a streamed turn
// outlives its handler, so it takes the lock over with `keepLock` and
// releases it when the run ends. Any other way out releases it here.
export async function withConversationTurn(
  { conversationId, session, correlationId }: TurnRequest,
  deps: ConversationDeps & { turnLock: TurnLock },
  turn: (conversation: Conversation, keepLock: () => () => void) => Promise<Response>,
): Promise<Response> {
  const conversation = findOwnedConversation(conversationId, session, deps);
  if (!conversation) return failureResponse("not_found", correlationId);
  const release = deps.turnLock.acquire(conversationId);
  if (!release) return failureResponse("turn_in_progress", correlationId);
  let isKept = false;
  const keepLock = () => {
    isKept = true;
    return release;
  };
  try {
    return await turn(conversation, keepLock);
  } finally {
    if (!isKept) release();
  }
}
