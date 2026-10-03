import { z } from "zod";
import {
  parseCallbackContact,
  requestCallback,
  type CallbackDeps,
} from "@/server/agent/callbacks/requests";
import type { PendingPause } from "@/server/agent/resume";
import { stepUp, type Session, type SessionDeps } from "@/server/modules/auth";
import { recordConsent } from "@/server/modules/lending";
import { saveKycDraft, type OnboardingDeps } from "@/server/modules/onboarding";

// What the customer did on a card. The server turns it into a reference;
// the password, the choice and the form never reach the graph (TD11).
// A null form is the form card's "Not now".
export const Answer = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("step_up"), password: z.string().min(1).max(200) }),
  z.strictObject({ kind: z.literal("consent"), agree: z.boolean() }),
  z.strictObject({ kind: z.literal("confirm"), confirm: z.boolean() }),
  z.strictObject({
    kind: z.literal("kyc_form"),
    form: z.record(z.string(), z.unknown()).nullable(),
  }),
  z.strictObject({ kind: z.literal("kyc_confirm"), confirm: z.boolean() }),
  z.strictObject({
    kind: z.literal("callback_form"),
    contact: z.record(z.string(), z.unknown()).nullable(),
  }),
]);
export type Answer = z.infer<typeof Answer>;

export type AnswerRequest = {
  answer: Answer;
  pending: PendingPause;
  conversationId: string;
  session: Session;
  token: string | undefined;
  correlationId: string;
};

export type AnswerDeps = SessionDeps & { onboarding: OnboardingDeps; callbacks: CallbackDeps };

export type Reference =
  | { ok: true; value: unknown; token?: string }
  | { ok: false; failure: "step_up_failed" | "not_signed_in" }
  | { ok: false; failure: "invalid_form"; fields: Partial<Record<string, string>> };

const confirmation = (accepted: boolean) =>
  ({ ok: true, value: accepted ? { confirmed: true } : { declined: true } }) as const;

export async function referenceFor(request: AnswerRequest, deps: AnswerDeps): Promise<Reference> {
  const { answer } = request;
  switch (answer.kind) {
    case "step_up":
      return stepUpReference(request, answer.password, deps);
    case "consent":
      return consentReference(request, answer.agree, deps);
    case "confirm":
    case "kyc_confirm":
      return confirmation(answer.confirm);
    case "kyc_form":
      return kycFormReference(request, answer.form, deps);
    case "callback_form":
      return callbackReference(request, answer.contact, deps);
  }
}

// BR-AUTH-03: checked and rotated by auth; a failure counts toward the
// lockout and the card stays.
async function stepUpReference(
  { session, token, correlationId, conversationId }: AnswerRequest,
  password: string,
  deps: AnswerDeps,
): Promise<Reference> {
  if (!session.customerId || !token) return { ok: false, failure: "not_signed_in" };
  const result = await stepUp({ token, password, correlationId, conversationId }, deps);
  if (!result.ok) return { ok: false, failure: "step_up_failed" };
  return { ok: true, value: { verified: true }, token: result.token };
}

// BR-LEND-07: consent is recorded for the terms on the pause, read from the
// checkpoint, never from the browser.
function consentReference(
  { session, pending, correlationId, conversationId }: AnswerRequest,
  agree: boolean,
  deps: AnswerDeps,
): Reference {
  const { customerId } = session;
  if (!customerId) return { ok: false, failure: "not_signed_in" };
  if (!agree || pending.pause.kind !== "consent") return { ok: true, value: { declined: true } };
  const { amountLkr, termMonths } = pending.pause;
  const consent = recordConsent(
    { customerId, conversationId, correlationId, amountLkr, termMonths },
    deps,
  );
  if (!consent.ok) throw new Error("a consent pause carried terms outside the product");
  return { ok: true, value: { consentId: consent.consentId } };
}

// FR-ONB-02: validated and stored encrypted by onboarding; the graph gets
// the draft ID. Guests may open an account (FR-AUTH-05).
function kycFormReference(
  { session, correlationId, conversationId }: AnswerRequest,
  form: Record<string, unknown> | null,
  deps: AnswerDeps,
): Reference {
  if (!form) return { ok: true, value: { declined: true } };
  const actor = session.customerId ?? `guest:${session.id}`;
  const saved = saveKycDraft(form, { conversationId, correlationId, actor }, deps.onboarding);
  if (!saved.ok) return { ok: false, failure: "invalid_form", fields: saved.errors };
  return { ok: true, value: { draftId: saved.draftId } };
}

// FR-AGT-14: a guest's name and number are checked and stored encrypted;
// the graph gets the request's ID. The reason is the pause's, read from
// the checkpoint.
function callbackReference(
  { session, pending, correlationId, conversationId }: AnswerRequest,
  input: Record<string, unknown> | null,
  deps: AnswerDeps,
): Reference {
  if (!input) return { ok: true, value: { declined: true } };
  if (pending.pause.kind !== "callback_form") {
    throw new Error("a callback answer reached a different card");
  }
  const parsed = parseCallbackContact(input);
  if (!parsed.ok) return { ok: false, failure: "invalid_form", fields: parsed.errors };
  const callbackId = requestCallback(
    {
      conversationId,
      correlationId,
      reason: pending.pause.reason,
      caller: { guestSessionId: session.id, contact: parsed.contact },
    },
    deps.callbacks,
  );
  return { ok: true, value: { callbackId } };
}
