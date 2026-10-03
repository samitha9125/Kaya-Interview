import { cookies } from "next/headers";
import { findCurrentConversation } from "@/server/agent/conversations/ownership";
import type { Pause } from "@/server/agent/nodes/pauses";
import { readTranscript, type TranscriptMessage } from "@/server/agent/transcript";
import { findCustomerName, resolveSession, type Session } from "@/server/modules/auth";
import { app } from "@/server/composition";
import { SESSION_COOKIE } from "./http/session-cookie";

// The same content a turn streams (FR-WEB-04), for a page load.
export type PageConversation = {
  id: string;
  messages: TranscriptMessage[];
  pause: ({ interruptId: string } & Pause) | null;
};

export type PageSession =
  | { kind: "signed_out" }
  | { kind: "guest"; conversation: PageConversation | null }
  | { kind: "customer"; name: string; conversation: PageConversation | null };

// What the chat page needs to know about the visitor, and nothing more.
export async function readPageSession(): Promise<PageSession> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return { kind: "signed_out" };
  const deps = app();
  const resolved = resolveSession(token, deps);
  if (!resolved.ok) return { kind: "signed_out" };
  const { session } = resolved;
  const conversation = await readPageConversation(session);
  if (!session.customerId) return { kind: "guest", conversation };
  const name = findCustomerName(deps.db, session.customerId);
  return name ? { kind: "customer", name, conversation } : { kind: "signed_out" };
}

// P1-11: a reload shows the conversation where it was, card included.
async function readPageConversation(session: Session): Promise<PageConversation | null> {
  const deps = app();
  const conversation = findCurrentConversation(session, deps);
  if (!conversation) return null;
  const { messages, pause } = await readTranscript(deps.graph, conversation.id);
  return {
    id: conversation.id,
    messages,
    pause: pause ? { interruptId: pause.interruptId, ...pause.pause } : null,
  };
}
