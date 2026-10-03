import { describe, expect, it } from "vitest";
import { aScore, noHistory, scriptedBureau } from "@/test/fake-bureau";
import { CONTEXT, lendingTestSetup, TERMS } from "@/test/lending-setup";
import { expectOk } from "@/test/results";
import { assessLoan, recordConsent } from "./index";

type Setup = ReturnType<typeof lendingTestSetup>;

function giveConsent(setup: Setup) {
  return expectOk(recordConsent({ ...CONTEXT, ...TERMS }, setup.deps)).consentId;
}

async function referCustomer(setup: Setup) {
  const consentId = giveConsent(setup);
  return expectOk(await assessLoan({ ...CONTEXT, consentId }, setup.deps)).assessment;
}

describe("lending/assessLoan: a replayed step (FR-PLAT-05, FR-AGT-13)", () => {
  it("FR-PLAT-05: assessing the same consent again returns the first assessment, with no second call or row", async () => {
    const scripted = scriptedBureau([aScore(800)]);
    const setup = lendingTestSetup(scripted.bureau);
    const consentId = giveConsent(setup);
    const first = await assessLoan({ ...CONTEXT, consentId }, setup.deps);
    setup.advance(1_000);

    const replay = await assessLoan({ ...CONTEXT, consentId }, setup.deps);

    expect(replay).toEqual(first);
    expect(scripted.calls).toHaveLength(1);
    expect(setup.count("loan_assessments")).toBe(1);
  });
});

describe("lending: one open application per customer (BR-LEND-08)", () => {
  it("BR-LEND-08: the database itself refuses a second open application", async () => {
    const setup = lendingTestSetup(scriptedBureau([noHistory]).bureau);
    const assessment = await referCustomer(setup);
    const insertAnother = setup.handle.sqlite.prepare(
      `INSERT INTO loan_applications (id, assessment_id, customer_id, status, amount_lkr, term_months, created_at)
       VALUES ('second', ?, ?, 'approved', 500000, 36, 0)`,
    );

    expect(() => insertAnother.run(assessment.assessmentId, CONTEXT.customerId)).toThrow(
      /UNIQUE constraint failed/,
    );
  });
});
