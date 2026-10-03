import { describe, expect, it } from "vitest";
import { modelRequestFor } from "./models";

describe("agent/models: what each role asks of its model", () => {
  it.each([
    { role: "triage" as const, reasoningEffort: null, maxOutputTokens: 400 },
    { role: "loan" as const, reasoningEffort: "low", maxOutputTokens: 800 },
    { role: "kyc" as const, reasoningEffort: "low", maxOutputTokens: 800 },
  ])(
    "TD6, FR-AGT-11: $role → reasoning $reasoningEffort, at most $maxOutputTokens output tokens",
    ({ role, reasoningEffort, maxOutputTokens }) => {
      expect(modelRequestFor(role, "some/model")).toEqual({
        modelId: "some/model",
        reasoningEffort,
        maxOutputTokens,
      });
    },
  );
});
