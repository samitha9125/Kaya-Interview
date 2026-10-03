import { Command } from "@langchain/langgraph";
import { ConsentReference } from "./nodes/consent";
import { runConfig, type ConversationGraph } from "./graph";

export type ResumeRequest = { threadId: string; interruptId: string; reference: unknown };
export type ResumeResult =
  { ok: true } | { ok: false; reason: "not_pending" | "invalid_reference" };

const REFERENCE_SCHEMAS = { consent: ConsentReference };

function isKnownKind(value: unknown): value is { kind: keyof typeof REFERENCE_SCHEMAS } {
  return typeof value === "object" && value !== null && "kind" in value && value.kind === "consent";
}

// FR-AGT-06: an interrupt ID is usable only while that thread's checkpoint
// still has it pending. Once resumed it's gone, so a replay is refused and
// an ID from another conversation never matches. The harness's turn lock
// (FR-WEB-03) keeps two resumes of one thread from racing.
export async function resumeInterrupt(
  graph: ConversationGraph,
  { threadId, interruptId, reference }: ResumeRequest,
): Promise<ResumeResult> {
  const config = runConfig(threadId);
  const snapshot = await graph.getState(config);
  const pending = snapshot.tasks
    .flatMap((task) => task.interrupts)
    .find((item) => item.id === interruptId);
  if (!pending || !isKnownKind(pending.value)) return { ok: false, reason: "not_pending" };
  if (!REFERENCE_SCHEMAS[pending.value.kind].safeParse(reference).success) {
    return { ok: false, reason: "invalid_reference" };
  }
  await graph.invoke(new Command({ resume: { [interruptId]: reference } }), config);
  return { ok: true };
}
