import { describe, expect, it } from "vitest";
import { scriptedBureau } from "@/test/fake-bureau";
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
