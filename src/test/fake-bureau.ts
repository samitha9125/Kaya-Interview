import type { BureauResult, CreditBureau } from "@/server/modules/gov-credit";

// A CreditBureau that answers from a script, one result per call, and
// records the NICs it was asked about. Running out of script is a test bug.
export function scriptedBureau(script: BureauResult[], callsPerDay = 5) {
  const calls: string[] = [];
  const bureau: CreditBureau = {
    callsPerDay,
    fetchScore: async (nic) => {
      calls.push(nic);
      const next = script.shift();
      if (!next) throw new Error("the scripted bureau was called more often than expected");
      return next;
    },
  };
  return { bureau, calls };
}

export const aScore = (score: number): BureauResult => ({ kind: "score", score });
export const noHistory: BureauResult = { kind: "no_history" };
export const timeout: BureauResult = { kind: "failure", cause: "timeout", isRetryable: true };
export const clientError: BureauResult = {
  kind: "failure",
  cause: "client_error",
  isRetryable: false,
};
