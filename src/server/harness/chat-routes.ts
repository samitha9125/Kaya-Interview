import { Command } from "@langchain/langgraph";
import { HumanMessage } from "langchain";
import { z } from "zod";
import type { ConversationContextValue } from "@/server/agent/context";
import {
  startConversation,
  type Conversation,
  type ConversationDeps,
} from "@/server/agent/conversations/ownership";
import { runConfig, type ConversationGraph } from "@/server/agent/graph";
import { findPendingPause, prepareResume, type PendingPause } from "@/server/agent/resume";
import { stepUp, type Session } from "@/server/modules/auth";
import { recordConsent } from "@/server/modules/lending";
import { currentModels } from "@/server/modules/settings";
import type { RateLimiter } from "@/server/platform/rate-limit";
import { ChatMessageBody, stripNics } from "./chat-input";
import { withConversationTurn } from "./conversation-turn";
import { failureResponse } from "./failures";
import { sessionCookie } from "./http/session-cookie";
import { handleRoute, type HarnessDeps, type RouteContext } from "./pipeline";
import { turnResponse } from "./turn-response";
import type { TurnLock } from "./turn-lock";

export type ChatRouteDeps = HarnessDeps &
  ConversationDeps & { turnLock: TurnLock; chatLimiter: RateLimiter; graph: ConversationGraph };

// What the customer did on a card. The server turns it into a reference;
// the password and the choice never reach the graph (TD11).
const Answer = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("step_up"), password: z.string().min(1).max(200) }),
  z.strictObject({ kind: z.literal("consent"), agree: z.boolean() }),
  z.strictObject({ kind: z.literal("confirm"), confirm: z.boolean() }),
]);
type Answer = z.infer<typeof Answer>;

const ResumeBody = z.strictObject({
  conversationId: z.string().min(1),
  interruptId: z.string().min(1),
  answer: Answer,
  idempotencyKey: z.uuid(),
});
type ResumeBody = z.infer<typeof ResumeBody>;

function contextFor(
  session: Session,
  conversation: Conversation,
  correlationId: string,
): ConversationContextValue {
  return {
    customerId: session.customerId,
    sessionId: session.id,
    conversationId: conversation.id,
    correlationId,
    models: conversation.models,
  };
}

// FR-WEB-03, P1-15: while a card is waiting, a chat message is refused and
// the pause is kept; otherwise LangGraph would start a new run and drop it.
export function postChatMessage(request: Request, deps: ChatRouteDeps): Promise<Response> {
  const options = {
    scope: "chat.message",
    body: ChatMessageBody,
    rateLimiter: deps.chatLimiter,
    session: "required" as const,
    typedFields: ["message"],
  };
  return handleRoute(request, options, deps, async ({ body, session, correlationId }) => {
    if (!session) return failureResponse("not_signed_in", correlationId);
    const conversationId =
      body.conversationId ?? startConversation(session, currentModels(deps.db), deps);
    const turn = { conversationId, session, correlationId };
    return withConversationTurn(turn, deps, async (conversation) => {
      if (await findPendingPause(deps.graph, conversationId)) {
        return failureResponse("pause_pending", correlationId);
      }
      const context = contextFor(session, conversation, correlationId);
      const before = (await deps.graph.getState(runConfig(conversationId))).values.messages ?? [];
      await deps.graph.invoke(
        { messages: [new HumanMessage(stripNics(body.message))] },
        runConfig(conversationId, context),
      );
      return turnResponse(deps.graph, conversationId, before.length);
    });
  });
}

// FR-AGT-06: the card's answer is verified or recorded here, and the graph
// resumes with a reference only. The pause's kind and terms are read from
// the checkpoint, never from the browser.
export function postResume(request: Request, deps: ChatRouteDeps): Promise<Response> {
  const options = { scope: "chat.resume", body: ResumeBody, session: "required" as const };
  return handleRoute(request, options, deps, async (route) => {
    const { body, session, correlationId } = route;
    if (!session) return failureResponse("not_signed_in", correlationId);
    const turn = { conversationId: body.conversationId, session, correlationId };
    return withConversationTurn(turn, deps, async (conversation) => {
      const pending = await findPendingPause(deps.graph, conversation.id);
      if (pending?.interruptId !== body.interruptId || pending.pause.kind !== body.answer.kind) {
        return failureResponse("pause_not_pending", correlationId);
      }
      const reference = await referenceFor(body, pending, route, deps);
      if (!reference.ok) return failureResponse(reference.failure, correlationId);
      const context = contextFor(session, conversation, correlationId);
      const before = (await deps.graph.getState(runConfig(conversation.id))).values.messages ?? [];
      const resumed = await prepareResume(deps.graph, {
        threadId: conversation.id,
        interruptId: body.interruptId,
        reference: reference.value,
      });
      if (!resumed.ok) return failureResponse("pause_not_pending", correlationId);
      await deps.graph.invoke(
        new Command({ resume: resumed.resume }),
        runConfig(conversation.id, context),
      );
      const response = await turnResponse(deps.graph, conversation.id, before.length);
      if (reference.token) response.headers.set("Set-Cookie", sessionCookie(reference.token));
      return response;
    });
  });
}

type Reference =
  | { ok: true; value: unknown; token?: string }
  | { ok: false; failure: "step_up_failed" | "not_signed_in" };

async function referenceFor(
  body: ResumeBody,
  pending: PendingPause,
  { session, token, correlationId }: RouteContext<ResumeBody>,
  deps: ChatRouteDeps,
): Promise<Reference> {
  const answer: Answer = body.answer;
  const customerId = session?.customerId;
  if (!customerId || !token) return { ok: false, failure: "not_signed_in" };
  switch (answer.kind) {
    case "step_up": {
      // BR-AUTH-03: checked and rotated by auth; a failure counts toward
      // the lockout and the card stays.
      const result = await stepUp(
        { token, password: answer.password, correlationId, conversationId: body.conversationId },
        deps,
      );
      if (!result.ok) return { ok: false, failure: "step_up_failed" };
      return { ok: true, value: { verified: true }, token: result.token };
    }
    case "consent": {
      if (!answer.agree || pending.pause.kind !== "consent") {
        return { ok: true, value: { declined: true } };
      }
      const { amountLkr, termMonths } = pending.pause;
      const consent = recordConsent(
        { customerId, conversationId: body.conversationId, correlationId, amountLkr, termMonths },
        deps,
      );
      if (!consent.ok) throw new Error("a consent pause carried terms outside the product");
      return { ok: true, value: { consentId: consent.consentId } };
    }
    case "confirm":
      return { ok: true, value: answer.confirm ? { confirmed: true } : { declined: true } };
  }
}
