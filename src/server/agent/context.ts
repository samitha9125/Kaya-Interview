import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { z } from "zod";

// BR-AUTH-01: who the customer is comes from the signed-in session, through
// the harness, on every run. It is never saved in state and never comes
// from chat or tool arguments.
export const ConversationContext = z.object({
  customerId: z.string().nullable(),
  sessionId: z.string(),
  conversationId: z.string(),
  correlationId: z.string(),
  models: z.object({ triage: z.string(), loan: z.string(), kyc: z.string() }),
});
export type ConversationContextValue = z.infer<typeof ConversationContext>;

export type NodeConfig = LangGraphRunnableConfig<ConversationContextValue>;

// A run without a valid context is a bug in the harness, not a customer
// error, so it throws.
export function contextOf(config: NodeConfig): ConversationContextValue {
  return ConversationContext.parse(config.context);
}
