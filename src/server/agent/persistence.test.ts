import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, fakeModel } from "langchain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "@/server/platform/db";
import { createCheckpointer } from "./checkpointer";
import { buildConversationGraph, runConfig } from "./graph";
import { REQUEST_ASSESSMENT } from "./nodes/loan-agent";
import { resumeInterrupt } from "./resume";
import { REFERRED_TO_OFFICER } from "./templates";

let dir: string;
let path: string;

function startServer(loanModel: BaseChatModel) {
  const { sqlite } = openDatabase(path);
  const graph = buildConversationGraph({ loanModel, checkpointer: createCheckpointer(sqlite) });
  return { graph, stop: () => sqlite.close() };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "bank-graph-"));
  path = join(dir, "bank.db");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("agent graph: SQLite checkpoints with sync durability", () => {
  it("P2-03: a pause survives a restart and resumes with its reference", async () => {
    const first = startServer(
      fakeModel().respondWithTools([{ name: REQUEST_ASSESSMENT, args: {} }]),
    );
    await first.graph.invoke({ messages: [new HumanMessage("Check my loan")] }, runConfig("t1"));
    first.stop();

    const second = startServer(fakeModel());
    const snapshot = await second.graph.getState(runConfig("t1"));
    const interruptId = snapshot.tasks[0]?.interrupts[0]?.id ?? "";
    const result = await resumeInterrupt(second.graph, {
      threadId: "t1",
      interruptId,
      reference: { consentId: "consent-1" },
    });
    const { values } = await second.graph.getState(runConfig("t1"));
    second.stop();

    expect(result).toEqual({ ok: true });
    expect(values.messages.at(-1)?.text).toBe(REFERRED_TO_OFFICER);
  });
});
