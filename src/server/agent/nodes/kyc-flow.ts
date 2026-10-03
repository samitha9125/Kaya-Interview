import { Command, interrupt } from "@langchain/langgraph";
import type { z } from "zod";
import { confirmKycApplication, type OnboardingDeps } from "@/server/modules/onboarding";
import { contextOf, type NodeConfig } from "../context";
import type { ConversationStateValue } from "../state";
import { CANT_COMPLETE, KYC_FORM_CANCELLED, KYC_NOT_SENT, KYC_SUBMITTED } from "../templates";
import { endWith } from "./endings";
import { ConfirmReference, KycFormReference, type Pause } from "./pauses";

// FR-ONB-02: the form card posts to the server, which validates and stores
// it encrypted; the graph resumes with the draft ID only. interrupt()
// comes first, as in every pause.
export function kycFormNode(state: ConversationStateValue) {
  const answer = interrupt<Pause, z.infer<typeof KycFormReference>>(
    { kind: "kyc_form" },
    { responseSchema: KycFormReference },
  );
  if ("declined" in answer) return endWith(state, "FORM_NOT_SENT", KYC_FORM_CANCELLED);
  return new Command({ goto: "kyc_confirm", update: { kycDraftId: answer.draftId } });
}

// The card shows the applicant their details, read from the encrypted
// draft by the harness for that response only; the pause carries the ID.
export function kycConfirmNode(state: ConversationStateValue) {
  const draftId = state.kycDraftId;
  if (!draftId) throw new Error("a KYC confirmation was reached without a draft");
  const answer = interrupt<Pause, z.infer<typeof ConfirmReference>>(
    { kind: "kyc_confirm", draftId },
    { responseSchema: ConfirmReference },
  );
  if ("declined" in answer) return endWith(state, "FORM_NOT_SENT", KYC_NOT_SENT);
  return new Command({ goto: "kyc_submit" });
}

// B3: an unverified pending application, which the branch completes.
// Confirming is idempotent by draft ID, so a replayed step finds the same
// application (FR-AGT-13).
export function kycSubmitNode(onboarding: OnboardingDeps) {
  return (state: ConversationStateValue, config: NodeConfig) => {
    const { conversationId, correlationId, customerId, sessionId } = contextOf(config);
    if (!state.kycDraftId) return endWith(state, "CHECK_UNAVAILABLE", CANT_COMPLETE);
    const actor = customerId ?? `guest:${sessionId}`;
    const result = confirmKycApplication(
      state.kycDraftId,
      { conversationId, correlationId, actor },
      onboarding,
    );
    if (!result.ok) return endWith(state, "CHECK_UNAVAILABLE", CANT_COMPLETE);
    return endWith(state, "SUBMITTED", KYC_SUBMITTED);
  };
}
