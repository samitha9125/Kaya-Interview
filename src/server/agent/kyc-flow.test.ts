import { AIMessage, fakeModel } from "langchain";
import { beforeEach, describe, expect, it } from "vitest";
import { saveKycDraft } from "@/server/modules/onboarding";
import { aKycForm } from "@/test/builders/kyc-form";
import { everythingStored } from "@/test/database";
import { scriptedBureau } from "@/test/fake-bureau";
import {
  ACCOUNT_OPENING_CALL,
  buildTestGraph,
  onboardingTestDeps,
  pendingInterrupts,
  resume,
  startJourney,
  testContext,
} from "@/test/graph";
import { lendingTestSetup } from "@/test/lending-setup";
import { createCheckpointer } from "./checkpointer";
import type { ConversationGraph } from "./graph";

const GUEST = testContext("t1", { customerId: null });

let setup: ReturnType<typeof lendingTestSetup>;
let graph: ConversationGraph;
let model: ReturnType<typeof fakeModel>;

// A guest at the form, with checkpoints in the same SQLite file as
// everything else, so "stored anywhere" includes them.
beforeEach(async () => {
  setup = lendingTestSetup(scriptedBureau([]).bureau);
  model = fakeModel()
    .respondWithTools([ACCOUNT_OPENING_CALL])
    .respond(new AIMessage("You're welcome."));
  graph = buildTestGraph(model, {
    lending: setup.deps,
    checkpointer: createCheckpointer(setup.handle.sqlite),
  });
  await startJourney(graph, "t1", "kyc", "I'd like to open an account", GUEST);
});

async function pending() {
  const [interrupt] = await pendingInterrupts(graph, "t1");
  return { id: interrupt!.id!, pause: interrupt!.value as { kind: string; draftId?: string } };
}

function savedDraft(): string {
  const saved = saveKycDraft(
    aKycForm(),
    { conversationId: "t1", correlationId: "c", actor: "guest:session-1" },
    onboardingTestDeps(setup.deps),
  );
  if (!saved.ok) throw new Error("the test's form was refused");
  return saved.draftId;
}

describe("agent/kyc: form data stays out of the graph (P0-19, BR-ONB-03)", () => {
  it("P0-19: resuming with the raw form instead of a draft ID is refused", async () => {
    const result = await resume(graph, "t1", (await pending()).id, aKycForm(), GUEST);

    expect(result).toEqual({ ok: false, reason: "invalid_reference" });
    expect((await pending()).pause.kind).toBe("kyc_form");
  });

  it("P0-19: after the whole journey, no form value is anywhere in the database, checkpoints included", async () => {
    await resume(graph, "t1", (await pending()).id, { draftId: savedDraft() }, GUEST);
    await resume(graph, "t1", (await pending()).id, { confirmed: true }, GUEST);

    const stored = everythingStored(setup.handle);
    expect(stored).toContain("pending_verification");
    expect(stored).not.toMatch(/Kasun|199512345678|Temple Road|0771234567/);
  });
});
