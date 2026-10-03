import { describe, expect, it } from "vitest";
import { assessFailureLabel, submitFailureLabel } from "./labels";

describe("agent/labels: failure reasons the LLM may learn about (FR-AGT-08)", () => {
  it.each([
    { reason: "budget_exhausted", label: "CHECK_UNAVAILABLE_TODAY" },
    { reason: "blocked", label: "CHECK_UNAVAILABLE_TODAY" },
    { reason: "cooling_down", label: "CHECK_UNAVAILABLE_TODAY" },
    { reason: "unavailable", label: "CHECK_UNAVAILABLE_TODAY" },
    { reason: "no_consent", label: "CHECK_UNAVAILABLE_TODAY" },
    { reason: "open_application", label: "OUTCOME_SHOWN" },
  ] as const)("FR-AGT-08: assessment failure $reason → $label", ({ reason, label }) => {
    expect(assessFailureLabel(reason)).toBe(label);
  });

  it.each([
    { reason: "expired", label: "OUTCOME_SHOWN" },
    { reason: "open_application", label: "OUTCOME_SHOWN" },
    { reason: "not_found", label: "CHECK_UNAVAILABLE_TODAY" },
    { reason: "not_submittable", label: "CHECK_UNAVAILABLE_TODAY" },
    { reason: "terms_changed", label: "CHECK_UNAVAILABLE_TODAY" },
  ] as const)("FR-AGT-08: submit refusal $reason → $label", ({ reason, label }) => {
    expect(submitFailureLabel(reason)).toBe(label);
  });
});
