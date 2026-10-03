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

describe("lending/submitApplication: bound to its assessment (BR-LEND-10)", () => {
  it.each([{ change: { amountLkr: 600_000 } }, { change: { termMonths: 48 } }])(
    "P0-12: a submission with different terms ($change) is rejected",
    async ({ change }) => {
      const { setup, assessment } = await assessed();

      const result = submit(setup, assessment.assessmentId, change);

      expect(result).toEqual({ ok: false, reason: "terms_changed" });
      expect(setup.count("loan_applications")).toBe(0);
    },
  );

  it.each([
    { ageMs: 30 * MINUTE - 1, expected: true }, // just under 30 minutes → still valid
    { ageMs: 30 * MINUTE, expected: false }, // at 30 minutes → start again
  ])("P0-12: an assessment $ageMs ms old → submitted: $expected", async ({ ageMs, expected }) => {
    const { setup, assessment } = await assessed();
    setup.advance(ageMs);

    const result = submit(setup, assessment.assessmentId);

    expect(result.ok).toBe(expected);
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

  it("P0-10: a second eligible assessment can't become a second open application", async () => {
    const { setup, assessment } = await assessed();
    const second = await assessOnce(setup);
    submit(setup, assessment.assessmentId);

    const result = submit(setup, second.assessmentId);

    expect(result).toEqual({ ok: false, reason: "open_application", status: "approved" });
  });
});
