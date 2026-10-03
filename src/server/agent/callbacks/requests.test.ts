import { beforeEach, describe, expect, it } from "vitest";
import { createAuditLog, findAuditEvents } from "@/server/platform/audit";
import type { DatabaseHandle } from "@/server/platform/db";
import { createTestDatabase, everythingStored } from "@/test/database";
import { fixedClock, sequentialIds, TEST_ENCRYPTION_KEY } from "@/test/fakes";
import { parseCallbackContact, requestCallback, type CallbackDeps } from "./requests";

let handle: DatabaseHandle;
let deps: CallbackDeps;

beforeEach(() => {
  handle = createTestDatabase();
  const clock = fixedClock();
  deps = {
    db: handle.db,
    clock,
    ids: sequentialIds("callback"),
    audit: createAuditLog({ clock, ids: sequentialIds("audit") }),
    encryptionKey: TEST_ENCRYPTION_KEY,
  };
});

const customerAsk = (reason: "loan" | "general" = "loan") => ({
  conversationId: "conversation-1",
  correlationId: "corr-1",
  reason,
  caller: { customerId: "customer-a" },
});

describe("agent/callbacks: one request per conversation and reason (FR-AGT-14)", () => {
  it("FR-AGT-14: asking twice finds the first request and records it once", () => {
    const first = requestCallback(customerAsk(), deps);

    const again = requestCallback(customerAsk(), deps);

    const requested = findAuditEvents(handle.db, "corr-1").filter(
      (event) => event.type === "callback.requested",
    );
    expect(again).toBe(first);
    expect(requested).toHaveLength(1);
  });

  it("FR-AGT-14: a different reason in the same conversation is its own request", () => {
    const loan = requestCallback(customerAsk("loan"), deps);

    const general = requestCallback(customerAsk("general"), deps);

    expect(general).not.toBe(loan);
  });

  it("FR-PLAT-02: a guest's name and number are stored encrypted", () => {
    requestCallback(
      {
        ...customerAsk(),
        caller: {
          guestSessionId: "s1",
          contact: { name: "Kasun Perera", mobileNumber: "0771234567" },
        },
      },
      deps,
    );

    const stored = everythingStored(handle);
    expect(stored).toContain("guest:s1");
    expect(stored).not.toMatch(/Kasun|0771234567/);
  });
});

describe("agent/callbacks: the guest callback card", () => {
  it("FR-AGT-14: a name and a Sri Lankan mobile number parse, the number in canonical form", () => {
    expect(parseCallbackContact({ name: " Kasun ", mobileNumber: "+94 77 123 4567" })).toEqual({
      ok: true,
      contact: { name: "Kasun", mobileNumber: "0771234567" },
    });
  });

  it("FR-AGT-14: each bad field gets its own message", () => {
    expect(parseCallbackContact({ name: "K", mobileNumber: "123" })).toEqual({
      ok: false,
      errors: {
        name: "Please enter your name.",
        mobileNumber: "Please enter a Sri Lankan mobile number, such as 077 123 4567.",
      },
    });
  });
});
