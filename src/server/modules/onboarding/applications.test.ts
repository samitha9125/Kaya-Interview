import { beforeEach, describe, expect, it } from "vitest";
import { createAuditLog, findAuditEvents } from "@/server/platform/audit";
import type { DatabaseHandle } from "@/server/platform/db";
import { aKycForm } from "@/test/builders/kyc-form";
import { createTestDatabase, everythingStored } from "@/test/database";
import { fixedClock, sequentialIds, TEST_ENCRYPTION_KEY } from "@/test/fakes";
import { confirmKycApplication, readKycDetails, saveKycDraft, type OnboardingDeps } from "./index";

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

// A draft the test expects to be saved.
function savedDraft(form = aKycForm()): string {
  const saved = saveKycDraft(form, CONTEXT, deps);
  if (!saved.ok) throw new Error("the test's form was refused");
  return saved.draftId;
}

const statusOf = (id: string) =>
  handle.sqlite.prepare("SELECT status FROM kyc_applications WHERE id = ?").pluck().get(id);

describe("onboarding/drafts: the form is stored encrypted (FR-ONB-02)", () => {
  it("FR-PLAT-02: no detail the applicant typed is readable in the database", () => {
    const form = aKycForm();

    saveKycDraft(form, CONTEXT, deps);

    const stored = everythingStored(handle);
    expect(stored).toContain("draft");
    expect(stored).not.toContain("Kasun");
    expect(stored).not.toContain("199512345678");
    expect(stored).not.toContain("Temple Road");
    expect(stored).not.toContain("0771234567");
  });

  it("FR-ONB-02: the bank can read the details back for the confirmation summary", () => {
    const draftId = savedDraft();

    const details = readKycDetails(draftId, CONTEXT, deps);

    expect(details).toMatchObject({ fullName: "Kasun Perera", nic: "199512345678" });
  });

  it("FR-ONB-01: an invalid form stores nothing and says what to fix", () => {
    const result = saveKycDraft(aKycForm({ mobileNumber: "12" }), CONTEXT, deps);

    expect(result).toEqual({
      ok: false,
      errors: { mobileNumber: "Please enter a Sri Lankan mobile number, such as 077 123 4567." },
    });
    expect(handle.sqlite.prepare("SELECT count(*) FROM kyc_applications").pluck().get()).toBe(0);
  });
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

  it("BR-ONB-02: the match is flagged for the branch, on the application only", () => {
    saveKycDraft(aKycForm(), CONTEXT, deps);
    saveKycDraft(aKycForm({ nic: CUSTOMER_NIC, dateOfBirth: "1990-05-03" }), CONTEXT, deps);

    const flags = handle.sqlite
      .prepare("SELECT matches_existing_customer FROM kyc_applications ORDER BY id")
      .pluck()
      .all();
    expect(flags).toEqual([0, 1]);
  });
});

describe("onboarding/confirm: one draft, one pending application (FR-ONB-02)", () => {
  it("FR-ONB-02: confirming makes the draft an unverified pending application", () => {
    const draftId = savedDraft();

    const result = confirmKycApplication(draftId, CONTEXT, deps);

    expect(result).toEqual({ ok: true, applicationId: draftId });
    expect(statusOf(draftId)).toBe("pending_verification");
  });

  it("FR-ONB-02: a replayed confirm returns the same application and records it once", () => {
    const draftId = savedDraft();
    const first = confirmKycApplication(draftId, CONTEXT, deps);

    const replay = confirmKycApplication(draftId, CONTEXT, deps);

    const pending = findAuditEvents(handle.db, CONTEXT.correlationId).filter(
      (event) => event.type === "kyc.application_pending",
    );
    expect(replay).toEqual(first);
    expect(pending).toHaveLength(1);
  });

  it("FR-AUTH-06: a draft from another conversation can't be confirmed or read", () => {
    const draftId = savedDraft();
    const elsewhere = { ...CONTEXT, conversationId: "conversation-2" };

    const result = confirmKycApplication(draftId, elsewhere, deps);

    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(readKycDetails(draftId, elsewhere, deps)).toBeUndefined();
    expect(statusOf(draftId)).toBe("draft");
  });
});
