import { resolveSession, type Session, type SessionDeps } from "@/server/modules/auth";
import { newCorrelationId } from "@/server/platform/ids";
import type { Idempotency } from "@/server/platform/idempotency";
import type { Logger } from "@/server/platform/logger";
import type { RateLimiter } from "@/server/platform/rate-limit";
import { z } from "zod";
import { failureResponse, type FailureKind } from "./failures";
import { clientIp } from "./http/client-ip";
import { isSameOrigin } from "./http/origin";
import { readSessionToken } from "./http/session-cookie";

export type HarnessDeps = SessionDeps & { idempotency: Idempotency; logger: Logger };

type WithIdempotencyKey = { idempotencyKey: string };

export type RouteOptions<Body extends WithIdempotencyKey> = {
  // Idempotency keys are claimed per scope and session, e.g. "chat.message".
  scope: string;
  body: z.ZodType<Body>;
  rateLimiter?: RateLimiter;
  // Sign-in and "I'm new" run before there is a session to check.
  session: "required" | "optional";
  // Fields a person typed. Their schema messages are written for people
  // and may be shown; anything else failing is a client bug and gets the
  // generic template.
  typedFields?: string[];
};

export type RouteContext<Body> = {
  correlationId: string;
  ip: string;
  session: Session | null;
  token: string | undefined;
  body: Body;
};

type Step<T> = { ok: true; value: T } | { ok: false; kind: FailureKind; message?: string };

const ClaimedSchema = z.object({ claimed: z.literal(true) });

// FR-WEB-01: every state-changing route goes through the same checks, in
// this order, before its handler runs: origin, rate limit, session, body,
// idempotency key. Any failure, including an unexpected error in the
// handler, leaves as a template and a reference (FR-WEB-05).
export async function handleRoute<Body extends WithIdempotencyKey>(
  request: Request,
  options: RouteOptions<Body>,
  deps: HarnessDeps,
  handler: (context: RouteContext<Body>) => Promise<Response>,
): Promise<Response> {
  const correlationId = newCorrelationId();
  try {
    const ip = clientIp(request);
    if (!isSameOrigin(request)) return failureResponse("forbidden", correlationId);
    if (options.rateLimiter && !options.rateLimiter.take(ip)) {
      return failureResponse("too_many_requests", correlationId);
    }
    const token = readSessionToken(request);
    const session = checkSession(token, options.session, deps);
    if (!session.ok) return failureResponse(session.kind, correlationId);
    const body = await parseBody(request, options.body, options.typedFields ?? []);
    if (!body.ok) return failureResponse(body.kind, correlationId, body.message);
    const claimKey = `${session.value?.id ?? `ip:${ip}`}:${body.value.idempotencyKey}`;
    if (!claimOnce(options.scope, claimKey, deps)) {
      return failureResponse("duplicate_request", correlationId);
    }
    return await handler({ correlationId, ip, session: session.value, token, body: body.value });
  } catch (error) {
    deps.logger.error("request failed", { correlationId, error });
    return failureResponse("internal", correlationId);
  }
}

function checkSession(
  token: string | undefined,
  mode: RouteOptions<WithIdempotencyKey>["session"],
  deps: SessionDeps,
): Step<Session | null> {
  if (!token)
    return mode === "optional" ? { ok: true, value: null } : { ok: false, kind: "not_signed_in" };
  const resolved = resolveSession(token, deps);
  if (resolved.ok) return { ok: true, value: resolved.session };
  if (mode === "optional") return { ok: true, value: null };
  return { ok: false, kind: resolved.reason === "expired" ? "session_expired" : "not_signed_in" };
}

async function parseBody<Body>(
  request: Request,
  schema: z.ZodType<Body>,
  typedFields: string[],
): Promise<Step<Body>> {
  const json: unknown = await request.json().catch(() => undefined);
  const parsed = schema.safeParse(json);
  if (parsed.success) return { ok: true, value: parsed.data };
  const [first] = parsed.error.issues;
  const isTyped = first !== undefined && typedFields.includes(String(first.path[0]));
  return { ok: false, kind: "invalid_input", message: isTyped ? first.message : undefined };
}

function claimOnce(scope: string, key: string, deps: HarnessDeps): boolean {
  const { isReplay } = deps.idempotency.runOnce(
    { scope, key, resultSchema: ClaimedSchema },
    () => ({ claimed: true as const }),
  );
  return !isReplay;
}
