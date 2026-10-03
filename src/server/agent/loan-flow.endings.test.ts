import { fakeModel } from "langchain";
import { describe, expect, it } from "vitest";
import type { BureauResult, CreditBureau } from "@/server/modules/gov-credit";
import { aScore, noHistory, scriptedBureau, serverError } from "@/test/fake-bureau";
import {
  ASSESSMENT_CALL,
  buildTestGraph,
  consentFor,
  pendingInterrupts,
  resume,
  sendMessage,
} from "@/test/graph";
import { lendingTestSetup, TERMS } from "@/test/lending-setup";
import { runConfig } from "./graph";
import {
  ASSESSMENT_EXPIRED,
  CHECK_UNAVAILABLE_TODAY,
  CONFIRM_DECLINED,
  CONSENT_DECLINED,
  eligible,
  notEligible,
  openApplication,
  REFERRED_TO_OFFICER,
  submitted,
} from "./templates";

const MINUTE = 60_000;

// Signed in with a fresh step-up, the model asking for TERMS each time.
function journey(bureau: CreditBureau) {
  const lending = lendingTestSetup(bureau);
  const stepUp = { fresh: true };
  const model = fakeModel().respondWithTools([ASSESSMENT_CALL]).respondWithTools([ASSESSMENT_CALL]);
  const graph = buildTestGraph(model, { lending: lending.deps, isStepUpFresh: () => stepUp.fresh });
  const pending = async () => (await pendingInterrupts(graph, "t1"))[0]!.id!;
  const answer = async (reference: unknown) => resume(graph, "t1", await pending(), reference);
  const state = async () => (await graph.getState(runConfig("t1"))).values;
  const lastReply = async () => (await state()).messages.at(-1)?.text;
  const start = async () => {
    await sendMessage(graph, "t1", "Check my loan");
    return answer({ consentId: consentFor(lending.deps, "t1") });
  };
  return { graph, lending, stepUp, pending, answer, state, lastReply, start };
}

const scored = (...results: BureauResult[]) => scriptedBureau(results).bureau;

describe("agent/loan flow: eligible → confirm → approved application (BR-LEND-09)", () => {
  it("BR-LEND-09: eligible shows the result and pauses for confirmation of the assessed terms", async () => {
    const flow = journey(scored(aScore(800)));

    await flow.start();

    expect(await flow.lastReply()).toBe(eligible(TERMS));
    expect((await pendingInterrupts(flow.graph, "t1"))[0]?.value).toEqual({
      kind: "confirm",
      ...TERMS,
    });
  });

  it("BR-LEND-09: confirming submits one approved application", async () => {
    const flow = journey(scored(aScore(800)));
    await flow.start();

    await flow.answer({ confirmed: true });

    expect(await flow.lastReply()).toBe(submitted(TERMS));
    expect((await flow.state()).applicationId).toEqual(expect.any(String));
    expect(flow.lending.count("loan_applications")).toBe(1);
  });

  it("P0-12: a confirmation carrying an amount is refused; the terms come only from the assessment", async () => {
    const flow = journey(scored(aScore(800)));
    await flow.start();

    const result = await flow.answer({ confirmed: true, amountLkr: 3_000_000 });

    expect(result).toEqual({ ok: false, reason: "invalid_reference" });
    expect(flow.lending.count("loan_applications")).toBe(0);
  });

  it("BR-AUTH-03: a step-up gone stale by submit time re-prompts, then submits", async () => {
    const flow = journey(scored(aScore(800)));
    await flow.start();
    flow.stepUp.fresh = false;
    await flow.answer({ confirmed: true });
    const pausedFor = (await pendingInterrupts(flow.graph, "t1"))[0]?.value;
    flow.stepUp.fresh = true;

    await flow.answer({ verified: true });

    expect(pausedFor).toEqual({ kind: "step_up" });
    expect(await flow.lastReply()).toBe(submitted(TERMS));
  });

  it("BR-LEND-10: confirming 30 minutes after the assessment → start again, nothing submitted", async () => {
    const flow = journey(scored(aScore(800)));
    await flow.start();
    flow.lending.advance(30 * MINUTE);

    await flow.answer({ confirmed: true });

    expect(await flow.lastReply()).toBe(ASSESSMENT_EXPIRED);
    expect(flow.lending.count("loan_applications")).toBe(0);
  });

  it("BR-LEND-09: declining the confirmation submits nothing", async () => {
    const flow = journey(scored(aScore(800)));
    await flow.start();

    await flow.answer({ declined: true });

    expect(await flow.lastReply()).toBe(CONFIRM_DECLINED);
    expect(flow.lending.count("loan_applications")).toBe(0);
  });
});

describe("agent/loan flow: the other endings", () => {
  it("BR-LEND-09: not eligible ends with its reason, no pause and nothing created", async () => {
    const flow = journey(scored(aScore(500)));

    await flow.start();

    expect(await flow.lastReply()).toBe(notEligible("credit_profile"));
    expect(await pendingInterrupts(flow.graph, "t1")).toEqual([]);
    expect(flow.lending.count("loan_applications")).toBe(0);
  });

  it("BR-LEND-09: a referral ends with the officer template and a referred application", async () => {
    const flow = journey(scored(noHistory));

    await flow.start();

    expect(await flow.lastReply()).toBe(REFERRED_TO_OFFICER);
    expect((await flow.state()).decision).toBe("referred");
    expect(flow.lending.count("loan_applications")).toBe(1);
  });

  it("P0-10: with an application open, a new request shows its status before any step-up", async () => {
    const flow = journey(scored(noHistory));
    await flow.start();
    flow.stepUp.fresh = false;

    await sendMessage(flow.graph, "t1", "Can I get another loan?");

    expect(await flow.lastReply()).toBe(openApplication("referred"));
    expect(await pendingInterrupts(flow.graph, "t1")).toEqual([]);
  });

  it("P1-01: no score available → CHECK_UNAVAILABLE_TODAY, nothing decided", async () => {
    const flow = journey(scored(serverError, serverError));

    await flow.start();

    expect(await flow.lastReply()).toBe(CHECK_UNAVAILABLE_TODAY);
    expect(flow.lending.count("loan_assessments")).toBe(0);
  });

  it("P1-01: an unexpected failure in the check ends honestly, through the node's error handler", async () => {
    const broken: CreditBureau = {
      callsPerDay: 5,
      fetchScore: async () => {
        throw new Error("socket hang up");
      },
    };
    const flow = journey(broken);

    await flow.start();

    expect(await flow.lastReply()).toBe(CHECK_UNAVAILABLE_TODAY);
  });

  it("BR-LEND-07: declining consent ends without a credit check", async () => {
    const scripted = scriptedBureau([]);
    const flow = journey(scripted.bureau);
    await sendMessage(flow.graph, "t1", "Check my loan");

    await flow.answer({ declined: true });

    expect(await flow.lastReply()).toBe(CONSENT_DECLINED);
    expect(scripted.calls).toEqual([]);
  });
});
