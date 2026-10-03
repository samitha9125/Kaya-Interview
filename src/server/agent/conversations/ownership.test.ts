import { beforeEach, describe, expect, it } from "vitest";
import type { Session } from "@/server/modules/auth";
import { DEFAULT_MODELS } from "@/server/modules/settings";
import type { DatabaseHandle } from "@/server/platform/db";
import { createTestDatabase } from "@/test/database";
import { fixedClock, sequentialIds } from "@/test/fakes";
import { findOwnedConversation, startConversation, type ConversationDeps } from "./ownership";

const customerA: Session = { id: "session-a1", customerId: "customer-a", stepUpAt: null };
const customerAOtherTab: Session = { id: "session-a2", customerId: "customer-a", stepUpAt: null };
const customerB: Session = { id: "session-b", customerId: "customer-b", stepUpAt: null };
const guest: Session = { id: "session-g1", customerId: null, stepUpAt: null };
const otherGuest: Session = { id: "session-g2", customerId: null, stepUpAt: null };

let handle: DatabaseHandle;
let deps: ConversationDeps;

beforeEach(() => {
  handle = createTestDatabase();
  deps = { db: handle.db, clock: fixedClock(), ids: sequentialIds("conversation") };
});

describe("agent/conversations: ownership (FR-AUTH-06)", () => {
  it("FR-AUTH-06: a customer finds their conversation from any of their sessions", () => {
    const id = startConversation(customerA, DEFAULT_MODELS, deps);

    expect(findOwnedConversation(id, customerAOtherTab, deps)?.id).toBe(id);
  });

  it("P0-04: another customer's conversation is not found", () => {
    const id = startConversation(customerA, DEFAULT_MODELS, deps);

    expect(findOwnedConversation(id, customerB, deps)).toBeUndefined();
  });

  it("FR-AUTH-06: a guest finds the conversation their session started", () => {
    const id = startConversation(guest, DEFAULT_MODELS, deps);

    expect(findOwnedConversation(id, guest, deps)?.id).toBe(id);
  });

  it.each([
    { case: "another guest", owner: guest, reader: otherGuest },
    { case: "a signed-in customer", owner: guest, reader: customerA },
    { case: "a guest, reading a customer's", owner: customerA, reader: guest },
  ])("P0-04: $case can't read someone else's conversation", ({ owner, reader }) => {
    const id = startConversation(owner, DEFAULT_MODELS, deps);

    expect(findOwnedConversation(id, reader, deps)).toBeUndefined();
  });

  it("P0-04: an invented conversation ID is not found", () => {
    expect(findOwnedConversation("no-such-conversation", customerA, deps)).toBeUndefined();
  });
});
