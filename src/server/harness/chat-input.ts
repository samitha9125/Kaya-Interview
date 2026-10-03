import { replaceNics } from "@/server/platform/pii";
import { z } from "zod";
import { MAX_MESSAGE_LENGTH } from "./config";

export const ChatMessageBody = z.strictObject({
  conversationId: z.string().min(1).optional(),
  message: z
    .string()
    .trim()
    .min(1, { error: "Please type a message." })
    .max(MAX_MESSAGE_LENGTH, {
      error: `Please keep your message under ${MAX_MESSAGE_LENGTH.toLocaleString("en-US")} characters.`,
    }),
  // Set by a starter button, which skips triage (FR-AGT-01).
  starter: z.enum(["loan", "kyc", "human"]).optional(),
  idempotencyKey: z.uuid(),
});

export type ChatMessageBody = z.infer<typeof ChatMessageBody>;

export const NIC_REMOVED = "[NIC removed]";

// FR-AGT-09 / P0-02: identity comes only from the session, so a NIC typed
// in chat is never needed. Stripping it here, before the graph, keeps it
// out of the model's input and out of every checkpoint.
export function stripNics(message: string): string {
  return replaceNics(message, NIC_REMOVED);
}
