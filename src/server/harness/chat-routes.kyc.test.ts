import { fakeModel } from "langchain";
import { beforeEach, describe, expect, it } from "vitest";
import { KYC_SUBMITTED } from "@/server/agent/templates";
import { aKycForm } from "@/test/builders/kyc-form";
import { chatRouteSetup } from "@/test/chat-routes";
import { everythingStored } from "@/test/database";
import { ACCOUNT_OPENING_CALL } from "@/test/graph";

let routes: ReturnType<typeof chatRouteSetup>;

// A guest who pressed "Open an account" (FR-AUTH-05).
beforeEach(() => {
  routes = chatRouteSetup(fakeModel().respondWithTools([ACCOUNT_OPENING_CALL]));
  routes.useGuestSession();
});

const openAccount = () => routes.chat("I'd like to open an account.", { starter: "kyc" });

describe("harness/chat-routes: the account-opening form card (FR-ONB-02)", () => {
  it("FR-AUTH-05: a guest's starter button opens the KYC form", async () => {
    const { turn } = await openAccount();

    expect(turn.pause?.kind).toBe("kyc_form");
  });

  it("FR-ONB-01: an invalid form → 400 with each field's message, and the card stays", async () => {
    const { turn } = await openAccount();

    const { response } = await routes.answer(turn, {
      kind: "kyc_form",
      form: aKycForm({ mobileNumber: "123", accountType: "fixed" }),
    });

    const again = await routes.chat("Hello?", { conversationId: turn.conversationId });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatchObject({
      code: "invalid_form",
      fields: {
        mobileNumber: "Please enter a Sri Lankan mobile number, such as 077 123 4567.",
        accountType: "Please choose a savings or current account.",
      },
    });
    expect(again.response.status).toBe(409);
  });

  it("FR-ONB-02: a valid form brings the confirmation card with the applicant's own details", async () => {
    const { turn } = await openAccount();

    const confirm = await routes.answer(turn, { kind: "kyc_form", form: aKycForm() });

    expect(confirm.turn.pause).toMatchObject({
      kind: "kyc_confirm",
      details: { fullName: "Kasun Perera", mobileNumber: "0771234567", accountType: "savings" },
    });
  });

  it("FR-ONB-02: confirming sends the application and tells the applicant to visit a branch", async () => {
    const { turn } = await openAccount();
    const confirm = await routes.answer(turn, { kind: "kyc_form", form: aKycForm() });

    const done = await routes.answer(confirm.turn, { kind: "kyc_confirm", confirm: true });

    expect(done.turn.messages.map((message) => message.text)).toEqual([KYC_SUBMITTED]);
    expect(done.turn.pause).toBeNull();
  });

  it("P0-19: after the whole journey, no form value is readable anywhere, checkpoints included", async () => {
    const { turn } = await openAccount();
    const confirm = await routes.answer(turn, { kind: "kyc_form", form: aKycForm() });

    await routes.answer(confirm.turn, { kind: "kyc_confirm", confirm: true });

    const stored = everythingStored(routes.handle);
    expect(stored).toContain("pending_verification");
    expect(stored).not.toMatch(/Kasun|199512345678|Temple Road|0771234567/);
  });
});
