import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_MODELS } from "@/server/modules/settings";
import type { DatabaseHandle } from "@/server/platform/db";
import { createTestDatabase } from "@/test/database";
import { fixedClock, sequentialIds } from "@/test/fakes";
import { findOwnedConversation, startConversation, type ConversationDeps } from "./ownership";
import { aSession } from "@/test/builders/session";

const customerA = aSession({ id: "session-a1", customerId: "customer-a" });
const customerB = aSession({ id: "session-b", customerId: "customer-b" });

let handle: DatabaseHandle;
let deps: ConversationDeps;

beforeEach(() => {
  handle = createTestDatabase();
  deps = { db: handle.db, clock: fixedClock(), ids: sequentialIds("conversation") };
});

describe("agent/conversations: ownership (FR-AUTH-06)", () => {
  it("P0-04: another customer's conversation is not found", () => {
    const id = startConversation(customerA, DEFAULT_MODELS, deps);

    expect(findOwnedConversation(id, customerB, deps)).toBeUndefined();
  });
});
