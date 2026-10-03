import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { END, START, StateGraph, StateSchema } from "@langchain/langgraph";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { openDatabase } from "@/server/platform/db";
import { createCheckpointer } from "./checkpointer";

const State = new StateSchema({ step: z.number().default(0) });

function buildGraph(path: string) {
  const { sqlite } = openDatabase(path);
  const graph = new StateGraph(State)
    .addNode("advance", (state) => ({ step: state.step + 1 }))
    .addEdge(START, "advance")
    .addEdge("advance", END)
    .compile({ checkpointer: createCheckpointer(sqlite) });
  return { graph, close: () => sqlite.close() };
}

const thread = { configurable: { thread_id: "conversation-1" } };

describe("agent/checkpointer: SQLite persistence", () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "bank-checkpoint-"));
    path = join(dir, "bank.db");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("FR-AGT-13: a conversation's state survives a restart (sync durability)", async () => {
    const before = buildGraph(path);
    await before.graph.invoke({ step: 0 }, { ...thread, durability: "sync" });
    before.close();

    const after = buildGraph(path);
    const snapshot = await after.graph.getState(thread);
    after.close();

    expect(snapshot.values).toEqual({ step: 1 });
  });

  it("FR-AGT-13: a restarted conversation continues from its saved state", async () => {
    const before = buildGraph(path);
    await before.graph.invoke({ step: 0 }, { ...thread, durability: "sync" });
    before.close();

    const after = buildGraph(path);
    const result = await after.graph.invoke({}, { ...thread, durability: "sync" });
    after.close();

    expect(result).toEqual({ step: 2 });
  });
});
