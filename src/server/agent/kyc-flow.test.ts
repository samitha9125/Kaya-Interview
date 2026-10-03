import { toJsonSchema } from "@langchain/core/utils/json_schema";
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
import { runConfig, type ConversationGraph } from "./graph";
import { startAccountOpening } from "./nodes/kyc-agent";
import { KYC_FORM_CANCELLED, KYC_NOT_SENT, KYC_SUBMITTED } from "./templates";

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

const lastText = async () => (await graph.getState(runConfig("t1"))).values.messages.at(-1)?.text;

describe("agent/kyc: the account-opening journey (FR-AGT-03)", () => {
  it("FR-AGT-03: a KYC conversation reaches the KYC agent, and its tool opens the form", async () => {
    const { pause } = await pending();

    expect(pause).toEqual({ kind: "kyc_form" });
    expect(JSON.stringify(model.calls[0])).toContain("You help people open an account");
  });

  it("FR-AGT-04: start_account_opening takes no arguments at all", () => {
    const schema = toJsonSchema(startAccountOpening.schema) as { properties?: object };

    expect(Object.keys(schema.properties ?? {})).toEqual([]);
  });

  it("FR-ONB-02: the form resumes with a draft ID, and confirming sends a pending application", async () => {
    const draftId = savedDraft();
    await resume(graph, "t1", (await pending()).id, { draftId }, GUEST);
    const confirm = await pending();

    await resume(graph, "t1", confirm.id, { confirmed: true }, GUEST);

    const status = setup.handle.sqlite
      .prepare("SELECT status FROM kyc_applications WHERE id = ?")
      .pluck()
      .get(draftId);
    expect(confirm.pause).toEqual({ kind: "kyc_confirm", draftId });
    expect(status).toBe("pending_verification");
    expect(await lastText()).toBe(KYC_SUBMITTED);
  });

  it("TD14: declining the form ends the journey and saves nothing", async () => {
    await resume(graph, "t1", (await pending()).id, { declined: true }, GUEST);

    expect(await lastText()).toBe(KYC_FORM_CANCELLED);
    expect(setup.count("kyc_applications")).toBe(0);
  });

  it("TD14: declining the confirmation sends nothing", async () => {
    const draftId = savedDraft();
    await resume(graph, "t1", (await pending()).id, { draftId }, GUEST);

    await resume(graph, "t1", (await pending()).id, { declined: true }, GUEST);

    const status = setup.handle.sqlite
      .prepare("SELECT status FROM kyc_applications WHERE id = ?")
      .pluck()
      .get(draftId);
    expect(await lastText()).toBe(KYC_NOT_SENT);
    expect(status).toBe("draft");
  });
});

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

  it("BR-ONB-03: the KYC agent learns only the label, never the details", async () => {
    await resume(graph, "t1", (await pending()).id, { draftId: savedDraft() }, GUEST);
    await resume(graph, "t1", (await pending()).id, { confirmed: true }, GUEST);

    await startJourney(graph, "t1", "kyc", "Thank you", GUEST);

    const input = JSON.stringify(model.calls[1]?.messages);
    expect(input).toContain("SUBMITTED");
    expect(input).not.toMatch(/Kasun|199512345678|Temple Road|0771234567/);
  });
});
