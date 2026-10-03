import { FALLBACK } from "@/components/api";

// The wire format of a turn (FR-WEB-04). It mirrors the harness's events;
// components never import server code, so the browser keeps its own copy.
export type KycDetails = {
  fullName: string;
  nic: string;
  dateOfBirth: string;
  address: string;
  mobileNumber: string;
  accountType: "savings" | "current";
};

export type Pause =
  | { interruptId: string; kind: "step_up" }
  | { interruptId: string; kind: "consent" | "confirm"; amountLkr: number; termMonths: number }
  | { interruptId: string; kind: "kyc_form" }
  | { interruptId: string; kind: "kyc_confirm"; draftId: string; details?: KycDetails | null };

export type ChatMessage = { id: string; role: "customer" | "assistant"; text: string };

export type RestoredConversation = { id: string; messages: ChatMessage[]; pause: Pause | null };

export type TurnEvent =
  | { type: "typing" }
  | { type: "progress"; text: string }
  | { type: "message"; id: string; text: string }
  | { type: "interrupt"; pause: Pause }
  // `refused`: the server turned the request down before the turn began
  // (an HTTP status), so nothing in the conversation changed.
  | { type: "error"; message: string; refused: boolean }
  | { type: "done"; conversationId: string };

const CONNECTION_LOST =
  "We lost the connection before the reply arrived. Reload the page to see where things are.";

function parseEvent(block: string): TurnEvent | null {
  const type = /^event: (.+)$/m.exec(block)?.[1];
  const data = /^data: (.+)$/m.exec(block)?.[1];
  if (!type || !data) return null;
  return { type, ...(JSON.parse(data) as object) } as TurnEvent;
}

async function refusal(response: Response): Promise<TurnEvent> {
  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: string };
  } | null;
  return { type: "error", message: payload?.error?.message ?? FALLBACK, refused: true };
}

// POSTs a turn and hands each event to `onEvent` as it arrives. Every
// request carries a fresh idempotency key (FR-WEB-01).
export async function sendTurn(
  url: string,
  body: Record<string, unknown>,
  onEvent: (event: TurnEvent) => void,
): Promise<void> {
  let isDone = false;
  const handle = (event: TurnEvent) => {
    if (event.type === "done") isDone = true;
    onEvent(event);
  };
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, idempotencyKey: crypto.randomUUID() }),
    });
    if (!response.ok || !response.body) return onEvent(await refusal(response));
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      const blocks = (buffer + chunk.value).split("\n\n");
      buffer = blocks.pop() ?? "";
      blocks.map(parseEvent).forEach((event) => event && handle(event));
    }
    if (!isDone) onEvent({ type: "error", message: CONNECTION_LOST, refused: false });
  } catch {
    if (!isDone) onEvent({ type: "error", message: FALLBACK, refused: false });
  }
}
