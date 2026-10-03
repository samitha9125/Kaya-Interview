import { describe, expect, it } from "vitest";
import { ChatMessageBody, NIC_REMOVED, stripNics } from "./chat-input";

const KEY = "6f1c2a7e-3b4d-4c5e-8f90-1a2b3c4d5e6f";

describe("harness/chat-input: message limits (FR-WEB-02)", () => {
  it.each([
    { length: 1_000, ok: true },
    { length: 1_001, ok: false },
  ])("P1-12: a $length-character message → accepted $ok", ({ length, ok }) => {
    const parsed = ChatMessageBody.safeParse({ message: "a".repeat(length), idempotencyKey: KEY });

    expect(parsed.success).toBe(ok);
  });

  it("FR-WEB-02: an over-long message gets a human message", () => {
    const parsed = ChatMessageBody.safeParse({ message: "a".repeat(1_001), idempotencyKey: KEY });

    expect(parsed.error?.issues[0]?.message).toBe(
      "Please keep your message under 1,000 characters.",
    );
  });

  it("FR-WEB-01: a message without an idempotency key is refused", () => {
    expect(ChatMessageBody.safeParse({ message: "hello" }).success).toBe(false);
  });

  it("FR-WEB-01: unknown fields are refused, so nothing can ride along to the graph", () => {
    const parsed = ChatMessageBody.safeParse({
      message: "hi",
      idempotencyKey: KEY,
      customerId: "c1",
    });

    expect(parsed.success).toBe(false);
  });
});

// Made-up NICs. secret-scan:ignore
describe("harness/chat-input: NIC stripping (FR-AGT-09)", () => {
  it("P0-02: a third party's NIC typed in chat is removed before the graph sees it", () => {
    expect(stripNics("check my brother 901234567V for a loan")).toBe(
      `check my brother ${NIC_REMOVED} for a loan`,
    );
  });

  it("P0-02: an ordinary message passes through unchanged", () => {
    expect(stripNics("I'd like LKR 500,000 over 24 months")).toBe(
      "I'd like LKR 500,000 over 24 months",
    );
  });
});
