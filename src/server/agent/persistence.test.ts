import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, fakeModel } from "langchain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LendingDeps } from "@/server/modules/lending";
import { openDatabase } from "@/server/platform/db";
import { aScore, scriptedBureau } from "@/test/fake-bureau";
import { ASSESSMENT_CALL, buildTestGraph, consentFor, resume, testContext } from "@/test/graph";
import { lendingTestSetup, TERMS } from "@/test/lending-setup";
import { createCheckpointer } from "./checkpointer";
import { runConfig } from "./graph";
import { eligible } from "./templates";

let dir: string;
let path: string;
let lending: LendingDeps;

// Checkpoints in a real SQLite file that is closed and reopened, as a
// restart would; lending's own records live on regardless.
function startServer(loanModel: BaseChatModel) {
  const { sqlite } = openDatabase(path);
  const graph = buildTestGraph(loanModel, { lending, checkpointer: createCheckpointer(sqlite) });
  return { graph, stop: () => sqlite.close() };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "bank-graph-"));
  path = join(dir, "bank.db");
  lending = lendingTestSetup(scriptedBureau([aScore(800)]).bureau).deps;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("agent graph: SQLite checkpoints with sync durability", () => {
  it("P2-03: a pause survives a restart and resumes with its reference", async () => {
    const first = startServer(fakeModel().respondWithTools([ASSESSMENT_CALL]));
    await first.graph.invoke(
      { messages: [new HumanMessage("Check my loan")], journey: "loan" as const },
      runConfig("t1", testContext("t1")),
    );
    first.stop();

    const second = startServer(fakeModel());
    const snapshot = await second.graph.getState(runConfig("t1"));
    const interruptId = snapshot.tasks[0]?.interrupts[0]?.id ?? "";
    const result = await resume(second.graph, "t1", interruptId, {
      consentId: consentFor(lending, "t1"),
    });
    const { values } = await second.graph.getState(runConfig("t1"));
    second.stop();

    expect(result.ok).toBe(true);
    expect(values.messages.at(-1)?.text).toBe(eligible(TERMS));
  });
});
