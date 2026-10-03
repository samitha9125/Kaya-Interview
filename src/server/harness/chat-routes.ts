import { Command } from "@langchain/langgraph";
import { HumanMessage } from "langchain";
import { z } from "zod";
import type { ConversationContextValue } from "@/server/agent/context";
import {
  startConversation,
  type Conversation,
  type ConversationDeps,
} from "@/server/agent/conversations/ownership";
import type { ConversationGraph } from "@/server/agent/graph";
import { findPendingPause, prepareResume } from "@/server/agent/resume";
import type { Session } from "@/server/modules/auth";
import type { OnboardingDeps } from "@/server/modules/onboarding";
import { currentModels } from "@/server/modules/settings";
import type { RateLimiter } from "@/server/platform/rate-limit";
import { ChatMessageBody, stripNics } from "./chat-input";
import { withConversationTurn } from "./conversation-turn";
import { failureResponse, formFailureResponse } from "./failures";
import { sessionCookie } from "./http/session-cookie";
import { Answer, referenceFor } from "./pause-answers";
import { viewPause } from "./pause-view";
import { handleRoute, type HarnessDeps } from "./pipeline";
import { streamTurn } from "./turn-stream";
import type { TurnLock } from "./turn-lock";

export type ChatRouteDeps = HarnessDeps &
  ConversationDeps & {
    turnLock: TurnLock;
    chatLimiter: RateLimiter;
    graph: ConversationGraph;
    onboarding: OnboardingDeps;
  };

const ResumeBody = z.strictObject({
  conversationId: z.string().min(1),
  interruptId: z.string().min(1),
  answer: Answer,
  idempotencyKey: z.uuid(),
});

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
    return withConversationTurn(turn, deps, async (conversation, keepLock) => {
      if (await findPendingPause(deps.graph, conversationId)) {
        return failureResponse("pause_pending", correlationId);
      }
      const message = new HumanMessage(stripNics(body.message));
      return streamTurn({
        graph: deps.graph,
        // A starter button picks the specialist (FR-AGT-01).
        input: body.starter
          ? { messages: [message], journey: body.starter }
          : { messages: [message] },
        context: contextFor(session, conversation, correlationId),
        logger: deps.logger,
        viewPause: (pending) => viewPause(pending, conversationId, deps.onboarding),
        release: keepLock(),
      });
    });
  });
}

// FR-AGT-06: the card's answer is verified or recorded here, and the graph
// resumes with a reference only. The pause's kind and terms are read from
// the checkpoint, never from the browser.
export function postResume(request: Request, deps: ChatRouteDeps): Promise<Response> {
  const options = { scope: "chat.resume", body: ResumeBody, session: "required" as const };
  return handleRoute(request, options, deps, async (route) => {
    const { body, session, token, correlationId } = route;
    if (!session) return failureResponse("not_signed_in", correlationId);
    const turn = { conversationId: body.conversationId, session, correlationId };
    return withConversationTurn(turn, deps, async (conversation, keepLock) => {
      const pending = await findPendingPause(deps.graph, conversation.id);
      if (pending?.interruptId !== body.interruptId || pending.pause.kind !== body.answer.kind) {
        return failureResponse("pause_not_pending", correlationId);
      }
      const reference = await referenceFor(
        {
          answer: body.answer,
          pending,
          conversationId: conversation.id,
          session,
          token,
          correlationId,
        },
        deps,
      );
      if (!reference.ok && reference.failure === "invalid_form") {
        return formFailureResponse(reference.fields, correlationId);
      }
      if (!reference.ok) return failureResponse(reference.failure, correlationId);
      const resumed = await prepareResume(deps.graph, {
        threadId: conversation.id,
        interruptId: body.interruptId,
        reference: reference.value,
      });
      if (!resumed.ok) return failureResponse("pause_not_pending", correlationId);
      // BR-AUTH-03: a step-up rotated the session, so the new cookie
      // leaves with the stream's headers.
      return streamTurn({
        graph: deps.graph,
        input: new Command({ resume: resumed.resume }),
        context: contextFor(session, conversation, correlationId),
        logger: deps.logger,
        viewPause: (pending) => viewPause(pending, conversation.id, deps.onboarding),
        release: keepLock(),
        headers: reference.token ? { "Set-Cookie": sessionCookie(reference.token) } : undefined,
      });
    });
  });
}
