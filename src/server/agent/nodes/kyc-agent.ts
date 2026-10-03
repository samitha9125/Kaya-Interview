import { tool, type ToolRuntime } from "langchain";
import { z } from "zod";
import type { ChatModelProvider } from "../ports";
import { KYC_PROMPT } from "../prompts/kyc";
import type { ConversationStateValue } from "../state";
import { createSpecialistNode, handOff, type ModelRetryOptions } from "./specialist";

export const START_ACCOUNT_OPENING = "start_account_opening";

// FR-AGT-03: the LLM can open the form but never sees what goes in it
// (BR-ONB-03). No arguments at all, so nothing personal can be passed
// (FR-AGT-04). An earlier draft is forgotten, so each start is fresh.
export const startAccountOpening = tool(
  (_input: Record<string, never>, runtime: ToolRuntime<ConversationStateValue>) =>
    handOff(runtime, "Form opened", "kyc_form", { kycDraftId: null }),
  {
    name: START_ACCOUNT_OPENING,
    description:
      "Open the bank's secure account-opening form, where the applicant fills in their own details.",
    schema: z.strictObject({}),
  },
);

export function createKycAgentNode(models: ChatModelProvider, retry: ModelRetryOptions) {
  return createSpecialistNode(
    {
      role: "kyc",
      tools: [startAccountOpening],
      systemPrompt: KYC_PROMPT,
      invalidInputHint: "start_account_opening takes no arguments.",
    },
    models,
    retry,
  );
}
