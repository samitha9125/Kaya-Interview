import { referenceFor } from "@/server/platform/ids";

export type FailureKind =
  | "forbidden"
  | "not_signed_in"
  | "sign_in_failed"
  | "sign_in_paused"
  | "session_expired"
  | "invalid_input"
  | "too_many_requests"
  | "duplicate_request"
  | "turn_in_progress"
  | "not_found"
  | "internal";

// FR-WEB-05: the browser only ever gets one of these templates and a
// reference. Raw errors stay in the logs, under the same correlation ID.
const FAILURES: Record<FailureKind, { status: number; message: string }> = {
  forbidden: {
    status: 403,
    message: "We stopped this request because it didn't come from our site.",
  },
  not_signed_in: { status: 401, message: "Please sign in to continue." },
  // One message for an unknown number, a wrong password and a locked
  // account (FR-AUTH-01), which still tells a real customer about the pause.
  sign_in_failed: {
    status: 401,
    message:
      "We couldn't sign you in with those details. After 5 tries in a row, sign-in pauses for 15 minutes.",
  },
  sign_in_paused: {
    status: 429,
    message: "Too many sign-in attempts from here. Please wait 15 minutes and try again.",
  },
  session_expired: {
    status: 401,
    message: "For your security, you've been signed out after a while. Please sign in again.",
  },
  invalid_input: {
    status: 400,
    message: "Something in that request wasn't right. Please try again.",
  },
  too_many_requests: {
    status: 429,
    message: "You're sending messages quickly. Please slow down and try again in a minute.",
  },
  duplicate_request: { status: 409, message: "We've already received that." },
  turn_in_progress: { status: 409, message: "I'm still working on your last message. One moment." },
  not_found: { status: 404, message: "We couldn't find that conversation." },
  internal: { status: 500, message: "" },
};

const internalMessage = (reference: string) =>
  `Something went wrong on our side. Reference: ${reference}. You can give this to our support team if they ask.`;

export type FailureBody = { error: { code: FailureKind; message: string; reference: string } };

// A route may give a more specific human message (a zod message such as
// the 1,000-character limit) but never raw error text.
export function failureResponse(
  kind: FailureKind,
  correlationId: string,
  humanMessage?: string,
): Response {
  const { status, message } = FAILURES[kind];
  const reference = referenceFor(correlationId);
  const fallback = kind === "internal" ? internalMessage(reference) : message;
  const body: FailureBody = { error: { code: kind, message: humanMessage ?? fallback, reference } };
  return Response.json(body, { status });
}
