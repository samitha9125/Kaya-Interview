import { describe, expect, it } from "vitest";
import { aScore, noHistory, scriptedBureau, serverError } from "@/test/fake-bureau";
import { CONTEXT, lendingTestSetup, TERMS } from "@/test/lending-setup";
import { expectOk } from "@/test/results";
import { assessLoan, recordConsent } from "./index";

type Setup = ReturnType<typeof lendingTestSetup>;

function consentAndAssess(setup: Setup, terms = TERMS) {
  const consent = expectOk(recordConsent({ ...CONTEXT, ...terms }, setup.deps));
  return assessLoan({ ...CONTEXT, consentId: consent.consentId }, setup.deps);
}

describe("lending/assessLoan: consent comes first (BR-LEND-07)", () => {
  it("BR-LEND-07: an unknown consent ID → no_consent, and the bureau is not called", async () => {
    const scripted = scriptedBureau([]);
    const setup = lendingTestSetup(scripted.bureau);

    const result = await assessLoan({ ...CONTEXT, consentId: "made-up" }, setup.deps);

    expect(result).toEqual({ ok: false, reason: "no_consent" });
    expect(scripted.calls).toEqual([]);
  });

  it.each([
    { field: "customerId", value: "customer-b" },
    { field: "conversationId", value: "conversation-2" },
  ])(
    "BR-LEND-07: a consent given with another $field can't be used → no_consent, no call",
    async ({ field, value }) => {
      const scripted = scriptedBureau([]);
      const setup = lendingTestSetup(scripted.bureau);
      const consent = expectOk(recordConsent({ ...CONTEXT, ...TERMS }, setup.deps));

      const result = await assessLoan(
        { ...CONTEXT, [field]: value, consentId: consent.consentId },
        setup.deps,
      );

      expect(result).toEqual({ ok: false, reason: "no_consent" });
      expect(scripted.calls).toEqual([]);
    },
  );

  it.each([
    { amountLkr: 49_999, termMonths: 36 },
    { amountLkr: 3_000_001, termMonths: 36 },
    { amountLkr: 500_000, termMonths: 5 },
    { amountLkr: 500_000, termMonths: 61 },
    { amountLkr: 500_000.5, termMonths: 36 },
  ])(
    "SPEC A2: consent for terms outside the product ($amountLkr LKR, $termMonths months) is refused",
    ({ amountLkr, termMonths }) => {
      const setup = lendingTestSetup(scriptedBureau([]).bureau);

      const result = recordConsent({ ...CONTEXT, amountLkr, termMonths }, setup.deps);

      expect(result).toEqual({ ok: false, reason: "invalid_terms" });
      expect(setup.count("consents")).toBe(0);
    },
  );

  it("BR-LEND-07: consent is stored with its audit record", () => {
    const setup = lendingTestSetup(scriptedBureau([]).bureau);

    expectOk(recordConsent({ ...CONTEXT, ...TERMS }, setup.deps));

    expect(setup.count("consents")).toBe(1);
    expect(setup.auditTypes()).toEqual(["consent.given"]);
  });
});

describe("lending/assessLoan: storing the decision (FR-LEND-01, BR-LEND-09)", () => {
  it("FR-LEND-01: the assessment is stored with its terms, outcome, confidence, threshold and score age", async () => {
    const setup = lendingTestSetup(scriptedBureau([aScore(800)]).bureau);

    const result = expectOk(await consentAndAssess(setup));

    const row = setup.handle.sqlite.prepare("SELECT * FROM loan_assessments").get();
    expect(result.assessment).toEqual({
      assessmentId: expect.any(String),
      outcome: "eligible",
      ineligibleReason: null,
      ...TERMS,
    });
    expect(row).toMatchObject({
      id: result.assessment.assessmentId,
      amount_lkr: TERMS.amountLkr,
      term_months: TERMS.termMonths,
      outcome: "eligible",
      confidence_bp: 10_000,
      threshold_bp: 9_500,
      score_fetched_at: setup.deps.clock.now().getTime(),
      score_stale: 0,
    });
  });

  it("FR-LEND-01: the decision and its audit record are written together", async () => {
    const setup = lendingTestSetup(scriptedBureau([aScore(800)]).bureau);

    await consentAndAssess(setup);

    expect(setup.auditTypes()).toEqual(["consent.given", "gov.call", "loan.assessed"]);
  });

  it("FR-PLAT-04: a failed audit write leaves no assessment stored", async () => {
    const setup = lendingTestSetup(scriptedBureau([aScore(800)]).bureau);
    const consent = expectOk(recordConsent({ ...CONTEXT, ...TERMS }, setup.deps));
    const failingAudit = {
      record: (_: unknown, event: { type: string }) => {
        if (event.type === "loan.assessed") throw new Error("audit store unavailable");
      },
    };

    const assessing = assessLoan(
      { ...CONTEXT, consentId: consent.consentId },
      { ...setup.deps, audit: failingAudit },
    );

    await expect(assessing).rejects.toThrow("audit store unavailable");
    expect(setup.count("loan_assessments")).toBe(0);
  });

  it("BR-LEND-09: eligible → no application yet; it waits for the customer's confirmation", async () => {
    const setup = lendingTestSetup(scriptedBureau([aScore(800)]).bureau);

    await consentAndAssess(setup);

    expect(setup.count("loan_applications")).toBe(0);
  });

  it("BR-LEND-09: not eligible → the journey ends and nothing is created", async () => {
    const setup = lendingTestSetup(scriptedBureau([aScore(500)]).bureau);

    const result = expectOk(await consentAndAssess(setup));

    expect(result.assessment).toMatchObject({
      outcome: "not_eligible",
      ineligibleReason: "credit_profile",
    });
    expect(setup.count("loan_applications")).toBe(0);
  });

  it("BR-LEND-09: a referral creates a referred application awaiting an officer", async () => {
    const setup = lendingTestSetup(scriptedBureau([noHistory]).bureau);

    const result = expectOk(await consentAndAssess(setup));

    const application = setup.handle.sqlite.prepare("SELECT * FROM loan_applications").get();
    expect(result.assessment.outcome).toBe("referred");
    expect(application).toMatchObject({
      assessment_id: result.assessment.assessmentId,
      status: "referred",
      officer_decision: null,
      ...{ amount_lkr: TERMS.amountLkr, term_months: TERMS.termMonths },
    });
  });

  it("BR-LEND-06: a customer with no bank record on file is referred, not decided", async () => {
    const setup = lendingTestSetup(scriptedBureau([aScore(800)]).bureau, () => undefined);

    const result = expectOk(await consentAndAssess(setup));

    expect(result.assessment.outcome).toBe("referred");
  });

  it("BR-LEND-05: the configured threshold is the one used and stored", async () => {
    const setup = lendingTestSetup(scriptedBureau([aScore(655)]).bureau);

    const result = expectOk(
      await consentAndAssess({ ...setup, deps: { ...setup.deps, thresholdBp: 9_000 } }),
    );

    const stored = setup.handle.sqlite.prepare("SELECT threshold_bp FROM loan_assessments").pluck();
    expect(result.assessment.outcome).toBe("eligible");
    expect(stored.get()).toBe(9_000);
  });
});

describe("lending/assessLoan: when no score is available", () => {
  it("FR-CRED-04: the failure reason is returned and nothing is decided", async () => {
    const setup = lendingTestSetup(scriptedBureau([serverError, serverError]).bureau);

    const result = await consentAndAssess(setup);

    expect(result).toEqual({ ok: false, reason: "unavailable" });
    expect(setup.count("loan_assessments")).toBe(0);
  });
});
