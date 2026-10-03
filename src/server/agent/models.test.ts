import { describe, expect, it } from "vitest";
import { modelRequestFor } from "./models";

describe("agent/models: what each role asks of its model", () => {
  it.each([
    { role: "triage" as const, reasoningEffort: null },
    { role: "loan" as const, reasoningEffort: "low" },
    { role: "kyc" as const, reasoningEffort: "low" },
  ])(
    "TD6, FR-AGT-11: $role → reasoning $reasoningEffort, at most 400 output tokens",
    ({ role, reasoningEffort }) => {
      expect(modelRequestFor(role, "some/model")).toEqual({
        modelId: "some/model",
        reasoningEffort,
        maxOutputTokens: 400,
      });
    },
  );
});
