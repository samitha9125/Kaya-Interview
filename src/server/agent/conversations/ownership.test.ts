import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_MODELS } from "@/server/modules/settings";
import type { DatabaseHandle } from "@/server/platform/db";
import { createTestDatabase } from "@/test/database";
import { fixedClock, sequentialIds } from "@/test/fakes";
import {
  findCurrentConversation,
  findOwnedConversation,
  startConversation,
  type ConversationDeps,
} from "./ownership";
import { aSession } from "@/test/builders/session";

const customerA = aSession({ id: "session-a1", customerId: "customer-a" });
const customerAOtherTab = aSession({ id: "session-a2", customerId: "customer-a" });
const customerB = aSession({ id: "session-b", customerId: "customer-b" });
const guest = aSession({ id: "session-g1", customerId: null });
const otherGuest = aSession({ id: "session-g2", customerId: null });

// Sessions in this file started at 09:00 (aSession).
const withClockAt = (iso: string): ConversationDeps => ({ ...deps, clock: fixedClock(iso) });

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

describe("agent/conversations: the conversation a reload restores (P1-11)", () => {
  it("P1-11: a reload finds the latest conversation this sign-in started", () => {
    startConversation(customerA, DEFAULT_MODELS, withClockAt("2026-10-03T09:10:00.000Z"));
    const latest = startConversation(
      customerA,
      DEFAULT_MODELS,
      withClockAt("2026-10-03T09:20:00.000Z"),
    );

    expect(findCurrentConversation(customerA, deps)?.id).toBe(latest);
  });

  it("P1-11: a new sign-in starts fresh, without the last sign-in's conversation", () => {
    startConversation(customerA, DEFAULT_MODELS, withClockAt("2026-10-03T08:30:00.000Z"));

    expect(findCurrentConversation(customerA, deps)).toBeUndefined();
  });

  it("P0-04: another customer's conversation is never restored", () => {
    startConversation(customerB, DEFAULT_MODELS, withClockAt("2026-10-03T09:30:00.000Z"));

    expect(findCurrentConversation(customerA, deps)).toBeUndefined();
  });
});
