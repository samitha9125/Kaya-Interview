import type { Pause } from "@/server/agent/nodes/pauses";
import type { PendingPause } from "@/server/agent/resume";
import { readKycDetails, type KycForm, type OnboardingDeps } from "@/server/modules/onboarding";

// What the browser needs to draw a card.
export type PauseView = { interruptId: string } & Pause & { details?: KycForm | null };

// A KYC confirmation shows the applicant their own details. They are read
// from the encrypted draft for this response only, so they never enter the
// graph or its checkpoints (BR-ONB-03).
export function viewPause(
  { interruptId, pause }: PendingPause,
  conversationId: string,
  onboarding: Pick<OnboardingDeps, "db" | "encryptionKey">,
): PauseView {
  if (pause.kind !== "kyc_confirm") return { interruptId, ...pause };
  const details = readKycDetails(pause.draftId, conversationId, onboarding) ?? null;
  return { interruptId, ...pause, details };
}
