import { describe, expect, it } from "vitest";
import { newCorrelationId, referenceFor } from "./ids";

describe("platform/ids: correlation IDs and references", () => {
  it("FR-WEB-05: a correlation ID uses only characters that can't be misread", () => {
    expect(newCorrelationId()).toMatch(/^[2-9A-HJKMNP-Z]{16}$/);
  });

  it("FR-WEB-05: the reference is the first four characters of the correlation ID", () => {
    expect(referenceFor("K7Q2ABCDEFGHJKMN")).toBe("K7Q2");
  });

  it("FR-WEB-05: two requests get different correlation IDs", () => {
    expect(newCorrelationId()).not.toBe(newCorrelationId());
  });
});
