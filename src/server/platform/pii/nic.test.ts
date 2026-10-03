import { describe, expect, it } from "vitest";
import { replaceNics } from "./nic";

// Made-up NICs in both formats; not real people's. secret-scan:ignore
describe("platform/pii: NIC-shaped text", () => {
  it.each([
    { case: "old format", text: "my NIC is 901234567V", expected: "my NIC is [NIC]" },
    { case: "old format, lower-case x", text: "901234567x please", expected: "[NIC] please" },
    { case: "new format", text: "it's 199012345678.", expected: "it's [NIC]." },
    { case: "new format with spaces", text: "1990 1234 5678", expected: "[NIC]" },
    { case: "new format with dashes", text: "1990-1234-5678", expected: "[NIC]" },
    { case: "old format with a space", text: "90123456 7 V", expected: "[NIC]" },
    { case: "two NICs", text: "901234567V and 199012345678", expected: "[NIC] and [NIC]" },
  ])("P0-02: $case is replaced", ({ text, expected }) => {
    expect(replaceNics(text, "[NIC]")).toBe(expected);
  });

  it.each([
    { case: "a mobile number", text: "call me on 0771234567" },
    { case: "a spaced mobile number", text: "077 123 4567" },
    { case: "a loan amount", text: "LKR 500,000 over 24 months" },
    { case: "a customer number", text: "I'm C1001" },
    { case: "a longer run of digits", text: "ref 12345678901234" },
  ])("P0-02: $case is left alone", ({ text }) => {
    expect(replaceNics(text, "[NIC]")).toBe(text);
  });
});
