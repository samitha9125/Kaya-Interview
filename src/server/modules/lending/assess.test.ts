import { describe, expect, it } from "vitest";
import { aScore, scriptedBureau } from "@/test/fake-bureau";
import { CONTEXT, lendingTestSetup, TERMS } from "@/test/lending-setup";
import { expectOk } from "@/test/results";
import { assessLoan, recordConsent } from "./index";

describe("lending/assessLoan: consent comes first (BR-LEND-07)", () => {
  it("BR-LEND-07: an unknown consent ID → no_consent, and the bureau is not called", async () => {
    const scripted = scriptedBureau([]);
    const setup = lendingTestSetup(scripted.bureau);

    const result = await assessLoan({ ...CONTEXT, consentId: "made-up" }, setup.deps);

    expect(result).toEqual({ ok: false, reason: "no_consent" });
    expect(scripted.calls).toEqual([]);
  });

  it.each([{ field: "customerId", value: "customer-b" }])(
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
});

describe("lending/assessLoan: the audit explains the decision", () => {
  it("FR-PLAT-03: loan.assessed carries the confidence reasons and inputs, never the score", async () => {
    // 760 is within 15 points of the band A edge: 9,000 bp, below 9,500.
    const setup = lendingTestSetup(scriptedBureau([aScore(760)]).bureau);
    const consent = expectOk(recordConsent({ ...CONTEXT, ...TERMS }, setup.deps));

    await assessLoan({ ...CONTEXT, consentId: consent.consentId }, setup.deps);

    const payload = setup.handle.sqlite
      .prepare("SELECT payload FROM audit_events WHERE type = 'loan.assessed'")
      .pluck()
      .get() as string;
    expect(JSON.parse(payload)).toMatchObject({
      outcome: "referred",
      confidenceBp: 9_000,
      band: "A",
      amountLkr: 500_000,
      maxAmountLkr: 3_000_000,
      confidenceReasons: [{ code: "score_near_band_edge", penaltyBp: 1_000 }],
    });
    expect(payload).not.toContain("760");
  });
});
