import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { describe, expect, it } from "vitest";
import { requestAssessment } from "./nodes/loan-agent";

describe("agent/loan agent: its one tool (FR-AGT-02, FR-AGT-04)", () => {
  it("FR-AGT-04: request_assessment takes the amount and term only, nothing identifying", () => {
    const schema = toJsonSchema(requestAssessment.schema) as { properties: object };

    expect(Object.keys(schema.properties).sort()).toEqual(["amountLkr", "termMonths"]);
  });
});
