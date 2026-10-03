import { interrupt } from "@langchain/langgraph";
import { z } from "zod";

// The route handler records consent and resumes with its ID. Strict, so a
// resume carrying anything else (consent text, a password) is refused.
export const ConsentReference = z.strictObject({ consentId: z.string().min(1) });
export type ConsentReference = z.infer<typeof ConsentReference>;

export const CONSENT_INTERRUPT = { kind: "consent" } as const;

// interrupt() comes first: on resume the node re-runs from the top, so
// anything before it would run twice.
export function consentNode() {
  const { consentId } = interrupt<typeof CONSENT_INTERRUPT, ConsentReference>(CONSENT_INTERRUPT, {
    responseSchema: ConsentReference,
  });
  return { consentId };
}
