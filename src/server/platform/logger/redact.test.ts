import { describe, expect, it } from "vitest";
import { redact } from "./redact";

// Generated-looking NICs in both formats; not real people's. secret-scan:ignore
const oldNic = "901234567V";
const newNic = "199012345678";

describe("platform/logger: redaction", () => {
  it.each([
    { case: "password", input: { password: "hunter2" }, expected: { password: "[REDACTED]" } },
    {
      case: "step-up password",
      input: { newPassword: "x" },
      expected: { newPassword: "[REDACTED]" },
    },
    {
      case: "session token",
      input: { sessionToken: "abc" },
      expected: { sessionToken: "[REDACTED]" },
    },
    { case: "token hash", input: { token_hash: "abc" }, expected: { token_hash: "[REDACTED]" } },
    { case: "API key", input: { apiKey: "sk-x" }, expected: { apiKey: "[REDACTED]" } },
    { case: "secret", input: { clientSecret: "s" }, expected: { clientSecret: "[REDACTED]" } },
    {
      case: "authorization",
      input: { Authorization: "Bearer x" },
      expected: { Authorization: "[REDACTED]" },
    },
    { case: "cookie", input: { "set-cookie": "a=b" }, expected: { "set-cookie": "[REDACTED]" } },
    { case: "NIC field", input: { nic: "anything" }, expected: { nic: "[REDACTED]" } },
    { case: "score", input: { score: 742 }, expected: { score: "[REDACTED]" } },
    { case: "credit score", input: { creditScore: 742 }, expected: { creditScore: "[REDACTED]" } },
  ])("FR-PLAT-06: a $case field is redacted by name", ({ input, expected }) => {
    expect(redact(input)).toEqual(expected);
  });

  it.each([
    { case: "old-format NIC", input: `customer typed ${oldNic} in chat` },
    { case: "new-format NIC", input: `customer typed ${newNic} in chat` },
    { case: "lower-case suffix", input: `customer typed ${oldNic.toLowerCase()} in chat` },
  ])("FR-PLAT-06: an $case inside any text is masked", ({ input }) => {
    expect(redact({ note: input })).toEqual({ note: "customer typed [NIC] in chat" });
  });

  it.each([
    { case: "token counts", input: { inputTokens: 1200, tokensUsed: 3 } },
    { case: "confidence", input: { confidenceBp: 9_500 } },
    { case: "short numbers", input: { amountLkr: 500_000, phone: "0771234567" } },
    { case: "longer digit runs", input: { reference: "1234567890123" } },
  ])("FR-PLAT-06: $case are left alone", ({ input }) => {
    expect(redact(input)).toEqual(input);
  });

  it("FR-PLAT-06: redaction reaches nested objects and arrays", () => {
    const input = { request: { body: { password: "p", items: [{ nic: "x" }, newNic] } } };

    expect(redact(input)).toEqual({
      request: { body: { password: "[REDACTED]", items: [{ nic: "[REDACTED]" }, "[NIC]"] } },
    });
  });

  it("FR-PLAT-06: an error keeps its name and message, with NICs masked", () => {
    const error = new TypeError(`lookup failed for ${newNic}`);

    expect(redact({ error })).toMatchObject({
      error: { name: "TypeError", message: "lookup failed for [NIC]" },
    });
  });

  it("FR-PLAT-06: the caller's object is not changed", () => {
    const input = { password: "p" };

    redact(input);

    expect(input).toEqual({ password: "p" });
  });
});
