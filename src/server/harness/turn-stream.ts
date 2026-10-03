import type { ConversationContextValue } from "@/server/agent/context";
import { runConfig, type ConversationGraph } from "@/server/agent/graph";
import { ProgressUpdate } from "@/server/agent/progress";
import type { PendingPause } from "@/server/agent/resume";
import { readTranscript } from "@/server/agent/transcript";
import type { Logger } from "@/server/platform/logger";
import { failureBody } from "./failures";
import type { PauseView } from "./pause-view";

// FR-WEB-04: what the browser hears during a turn. Replies are sent whole,
// after the graph has validated them (FR-AGT-10); only typing and progress
// arrive while it works.
export type TurnEvent =
  | { type: "typing" }
  | { type: "progress"; text: string }
  | { type: "message"; id: string; text: string }
  | { type: "interrupt"; pause: PauseView }
  | { type: "error"; message: string; reference: string }
  | { type: "done"; conversationId: string };

export type TurnRun = {
  graph: ConversationGraph;
  input: Parameters<ConversationGraph["stream"]>[0];
  context: ConversationContextValue;
  logger: Logger;
  viewPause: (pending: PendingPause) => PauseView;
  // Called once the run has finished, however it finished.
  release: () => void;
  headers?: HeadersInit;
};

export function encodeEvent({ type, ...data }: TurnEvent): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

// A dropped connection doesn't stop the run: it finishes, its side effects
// happen once, and a reload shows the result (P1-11).
export function streamTurn(run: TurnRun): Response {
  const encoder = new TextEncoder();
  let isOpen = true;
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: TurnEvent) => {
        if (!isOpen) return;
        try {
          controller.enqueue(encoder.encode(encodeEvent(event)));
        } catch {
          isOpen = false;
        }
      };
      await runTurn(run, send);
      if (isOpen) controller.close();
    },
    cancel() {
      isOpen = false;
    },
  });
  const headers = new Headers(run.headers);
  headers.set("Content-Type", "text/event-stream; charset=utf-8");
  headers.set("Cache-Control", "no-cache, no-transform");
  // The reverse proxy in front of the app (ARCHITECTURE §12) would
  // otherwise buffer the stream and the typing event would arrive last.
  headers.set("X-Accel-Buffering", "no");
  return new Response(body, { headers });
}

async function runTurn(
  { graph, input, context, logger, viewPause, release }: TurnRun,
  send: (event: TurnEvent) => void,
): Promise<void> {
  const { conversationId, correlationId } = context;
  try {
    send({ type: "typing" });
    const before = (await graph.getState(runConfig(conversationId))).values.messages ?? [];
    const stream = await graph.stream(input, {
      ...runConfig(conversationId, context),
      streamMode: "custom",
    });
    for await (const chunk of stream) {
      const progress = ProgressUpdate.safeParse(chunk);
      if (progress.success) send({ type: "progress", text: progress.data.progress });
    }
    const { messages, pause } = await readTranscript(graph, conversationId, before.length);
    for (const { id, role, text } of messages) {
      if (role === "assistant") send({ type: "message", id, text });
    }
    if (pause) send({ type: "interrupt", pause: viewPause(pause) });
  } catch (error) {
    logger.error("turn failed", { correlationId, error });
    const { message, reference } = failureBody("internal", correlationId).error;
    send({ type: "error", message, reference });
  } finally {
    release();
    send({ type: "done", conversationId });
  }
}
