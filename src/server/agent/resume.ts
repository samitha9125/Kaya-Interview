import { runConfig, type ConversationGraph } from "./graph";
import { REFERENCE_SCHEMAS, type Pause, type PauseKind } from "./nodes/pauses";

export type PendingPause = { interruptId: string; pause: Pause };

export type ResumeRequest = {
  threadId: string;
  interruptId: string;
  reference: unknown;
};
export type ResumeResult =
  | { ok: true; resume: Record<string, unknown> }
  | { ok: false; reason: "not_pending" | "invalid_reference" };

function isPause(value: unknown): value is Pause {
  if (typeof value !== "object" || value === null || !("kind" in value)) return false;
  return typeof value.kind === "string" && value.kind in REFERENCE_SCHEMAS;
}

// The pause this conversation is waiting on, if any. The harness reads its
// kind and terms from here, never from the browser.
export async function findPendingPause(
  graph: ConversationGraph,
  threadId: string,
): Promise<PendingPause | undefined> {
  const snapshot = await graph.getState(runConfig(threadId));
  const pending = snapshot.tasks.flatMap((task) => task.interrupts).find((item) => item.id);
  if (!pending?.id || !isPause(pending.value)) return undefined;
  return { interruptId: pending.id, pause: pending.value };
}

// FR-AGT-06: an interrupt ID is usable only while that thread's checkpoint
// still has it pending. Once resumed it's gone, so a replay is refused and
// an ID from another conversation never matches. The caller runs the
// returned resume map, as `new Command({ resume })`, under the harness's turn lock (FR-WEB-03), so two
// resumes of one thread can't race.
export async function prepareResume(
  graph: ConversationGraph,
  { threadId, interruptId, reference }: ResumeRequest,
): Promise<ResumeResult> {
  const pending = await findPendingPause(graph, threadId);
  if (pending?.interruptId !== interruptId) return { ok: false, reason: "not_pending" };
  const kind: PauseKind = pending.pause.kind;
  if (!REFERENCE_SCHEMAS[kind].safeParse(reference).success) {
    return { ok: false, reason: "invalid_reference" };
  }
  return { ok: true, resume: { [interruptId]: reference } };
}
