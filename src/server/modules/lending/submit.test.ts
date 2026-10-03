import { describe, expect, it } from "vitest";
import { aScore, noHistory, scriptedBureau } from "@/test/fake-bureau";
import { CONTEXT, lendingTestSetup, TERMS } from "@/test/lending-setup";
import { expectOk } from "@/test/results";
import { assessLoan, recordConsent, submitApplication } from "./index";

const MINUTE = 60_000;

type Setup = ReturnType<typeof lendingTestSetup>;

async function assessed(score: number | null = 800) {
  const setup = lendingTestSetup(
    scriptedBureau([score === null ? noHistory : aScore(score), aScore(800)]).bureau,
  );
  const assessment = await assessOnce(setup);
  return { setup, assessment };
}

async function assessOnce(setup: Setup) {
  const consent = expectOk(recordConsent({ ...CONTEXT, ...TERMS }, setup.deps));
  const result = await assessLoan({ ...CONTEXT, consentId: consent.consentId }, setup.deps);
  return expectOk(result).assessment;
}

function submit(
  setup: Setup,
  assessmentId: string,
  overrides: { amountLkr?: number; termMonths?: number } = {},
) {
  return submitApplication({ ...CONTEXT, assessmentId, ...TERMS, ...overrides }, setup.deps);
}

describe("lending/submitApplication: an eligible assessment becomes an application (BR-LEND-09)", () => {
  it("BR-LEND-09: confirming an eligible assessment creates one approved application, audited", async () => {
    const { setup, assessment } = await assessed();

    const result = submit(setup, assessment.assessmentId);

    const row = setup.handle.sqlite.prepare("SELECT * FROM loan_applications").get();
    expect(result).toEqual({ ok: true, applicationId: expect.any(String) });
    expect(row).toMatchObject({
      id: expectOk(result).applicationId,
      assessment_id: assessment.assessmentId,
      status: "approved",
    });
    expect(setup.auditTypes()).toContain("loan.applied");
  });

  it.each([
    { score: 500, outcome: "not eligible" },
    { score: null, outcome: "referred" },
  ])("BR-LEND-09: a $outcome assessment can't be submitted", async ({ score }) => {
    const { setup, assessment } = await assessed(score);

    const result = submit(setup, assessment.assessmentId);

    expect(result).toEqual({ ok: false, reason: "not_submittable" });
  });
});

describe("lending/submitApplication: bound to its assessment (BR-LEND-10)", () => {
  it.each([
    { change: { amountLkr: 600_000 } },
    { change: { amountLkr: 499_999 } },
    { change: { termMonths: 48 } },
  ])("P0-12: a submission with different terms ($change) is rejected", async ({ change }) => {
    const { setup, assessment } = await assessed();

    const result = submit(setup, assessment.assessmentId, change);

    expect(result).toEqual({ ok: false, reason: "terms_changed" });
    expect(setup.count("loan_applications")).toBe(0);
  });

  it.each([
    { ageMs: 30 * MINUTE - 1, expected: true }, // just under 30 minutes → still valid
    { ageMs: 30 * MINUTE, expected: false }, // at 30 minutes → start again
  ])("P0-12: an assessment $ageMs ms old → submitted: $expected", async ({ ageMs, expected }) => {
    const { setup, assessment } = await assessed();
    setup.advance(ageMs);

    const result = submit(setup, assessment.assessmentId);

    expect(result.ok).toBe(expected);
  });

  it("P0-12: an expired assessment says so", async () => {
    const { setup, assessment } = await assessed();
    setup.advance(30 * MINUTE);

    expect(submit(setup, assessment.assessmentId)).toEqual({ ok: false, reason: "expired" });
  });

  it.each([
    { field: "customerId", value: "customer-b" },
    { field: "conversationId", value: "conversation-2" },
  ])("P0-12: an assessment from another $field is not found", async ({ field, value }) => {
    const { setup, assessment } = await assessed();

    const result = submitApplication(
      { ...CONTEXT, [field]: value, assessmentId: assessment.assessmentId, ...TERMS },
      setup.deps,
    );

    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("BR-LEND-10: a refused submission is audited with its reason", async () => {
    const { setup, assessment } = await assessed();

    submit(setup, assessment.assessmentId, { amountLkr: 600_000 });

    const refusal = setup.handle.sqlite
      .prepare("SELECT payload FROM audit_events WHERE type = 'loan.submit_refused'")
      .pluck()
      .get();
    expect(JSON.parse(String(refusal))).toMatchObject({ reason: "terms_changed" });
  });
});

describe("lending/submitApplication: replays and duplicates", () => {
  it("P0-09: a replayed submit returns the same application and creates no other", async () => {
    const { setup, assessment } = await assessed();
    const first = submit(setup, assessment.assessmentId);

    const replay = submit(setup, assessment.assessmentId);

    expect(replay).toEqual(first);
    expect(setup.count("loan_applications")).toBe(1);
  });

  it("P0-09: a replay after the assessment has expired still returns the original application", async () => {
    const { setup, assessment } = await assessed();
    const first = submit(setup, assessment.assessmentId);
    setup.advance(30 * MINUTE);

    expect(submit(setup, assessment.assessmentId)).toEqual(first);
  });

  it("P0-10: a second eligible assessment can't become a second open application", async () => {
    const { setup, assessment } = await assessed();
    const second = await assessOnce(setup);
    submit(setup, assessment.assessmentId);

    const result = submit(setup, second.assessmentId);

    expect(result).toEqual({ ok: false, reason: "open_application", status: "approved" });
  });
});
