import { describe, expect, it } from "vitest";
import { NIC_REMOVED, stripNics } from "./chat-input";

// Made-up NICs. secret-scan:ignore
describe("harness/chat-input: NIC stripping (FR-AGT-09)", () => {
  it("P0-02: a third party's NIC typed in chat is removed before the graph sees it", () => {
    expect(stripNics("check my brother 901234567V for a loan")).toBe(
      `check my brother ${NIC_REMOVED} for a loan`,
    );
  });
});
