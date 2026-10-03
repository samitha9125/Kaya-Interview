import { MessagesValue, StateSchema } from "@langchain/langgraph";
import { z } from "zod";

// Saved state holds references only: a consent ID, never consent text or
// a password (ARCHITECTURE §2).
export const ConversationState = new StateSchema({
  messages: MessagesValue,
  consentId: z.string().optional(),
  decision: z.enum(["eligible", "not_eligible", "referred"]).optional(),
});

export type ConversationStateValue = typeof ConversationState.State;
