import { beforeEach, describe, expect, it } from "vitest";
import { createAuditLog } from "@/server/platform/audit";
import type { DatabaseHandle } from "@/server/platform/db";
import { aKycForm } from "@/test/builders/kyc-form";
import { createTestDatabase } from "@/test/database";
import { fixedClock, sequentialIds, TEST_ENCRYPTION_KEY } from "@/test/fakes";
import { saveKycDraft, type OnboardingDeps } from "./index";

// A NIC the bank already has a customer for. secret-scan:ignore
const CUSTOMER_NIC = "199012300042";
const CONTEXT = { conversationId: "conversation-1", correlationId: "corr-1", actor: "guest:s1" };

let handle: DatabaseHandle;
let deps: OnboardingDeps;

beforeEach(() => {
  handle = createTestDatabase();
  const clock = fixedClock();
  deps = {
    db: handle.db,
    clock,
    ids: sequentialIds("kyc"),
    audit: createAuditLog({ clock, ids: sequentialIds("audit") }),
    encryptionKey: TEST_ENCRYPTION_KEY,
    isExistingCustomerNic: (nic) => nic === CUSTOMER_NIC,
  };
});

describe("onboarding/drafts: an existing customer's NIC (BR-ONB-02)", () => {
  it("P0-14: the answer is identical whether or not the NIC belongs to a customer", () => {
    const stranger = saveKycDraft(aKycForm(), CONTEXT, deps);

    const customer = saveKycDraft(
      aKycForm({ nic: CUSTOMER_NIC, dateOfBirth: "1990-05-03" }),
      CONTEXT,
      deps,
    );

    expect(Object.keys(customer)).toEqual(Object.keys(stranger));
    expect(customer).toEqual({ ok: true, draftId: expect.any(String) });
    expect(stranger).toEqual({ ok: true, draftId: expect.any(String) });
  });
});
