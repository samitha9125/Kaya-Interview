import { describe, expect, it } from "vitest";
import { aKycForm } from "@/test/builders/kyc-form";
import { parseKycForm } from "./kyc-form";

const NOW = new Date("2026-10-03T10:00:00.000Z");

describe("onboarding/kyc-form: the account-opening form (FR-ONB-01)", () => {
  it("FR-ONB-01: a valid form parses, with the NIC and mobile number in one canonical form", () => {
    const result = parseKycForm(
      aKycForm({ nic: "1995 1234 5678", mobileNumber: "+94 77 123 4567" }),
      NOW,
    );

    expect(result).toEqual({
      ok: true,
      form: {
        fullName: "Kasun Perera",
        nic: "199512345678",
        dateOfBirth: "1995-05-03",
        address: "12 Temple Road, Kandy",
        mobileNumber: "0771234567",
        accountType: "savings",
      },
    });
  });

  it.each([
    {
      field: "fullName",
      value: "K",
      message: "Please enter your full name as it appears on your NIC.",
    },
    {
      field: "nic",
      value: "12345",
      message: "Please enter a valid NIC: 9 digits and V or X, or 12 digits.",
    },
    {
      field: "dateOfBirth",
      value: "03/05/1995",
      message: "Please enter your date of birth as YYYY-MM-DD.",
    },
    {
      field: "dateOfBirth",
      value: "1995-02-30",
      message: "Please enter your date of birth as YYYY-MM-DD.",
    },
    {
      field: "dateOfBirth",
      value: "2026-10-04",
      message: "Your date of birth can't be in the future.",
    },
    { field: "address", value: "Kand", message: "Please enter your home address." },
    {
      field: "mobileNumber",
      value: "011 234 5678",
      message: "Please enter a Sri Lankan mobile number, such as 077 123 4567.",
    },
    {
      field: "accountType",
      value: "fixed",
      message: "Please choose a savings or current account.",
    },
  ])("FR-ONB-01: $field '$value' → '$message'", ({ field, value, message }) => {
    const result = parseKycForm(aKycForm({ [field]: value }), NOW);

    expect(result).toEqual({ ok: false, errors: { [field]: message } });
  });

  it.each([
    { nic: "199612345678", dateOfBirth: "1995-05-03", case: "new format, year after" },
    { nic: "951234567V", dateOfBirth: "1996-05-03", case: "old format, year before" },
  ])(
    "BR-ONB-01: a NIC whose birth year differs from the date of birth is refused ($case)",
    ({ nic, dateOfBirth }) => {
      const result = parseKycForm(aKycForm({ nic, dateOfBirth }), NOW);

      expect(result).toEqual({
        ok: false,
        errors: { nic: "The birth year in your NIC doesn't match your date of birth." },
      });
    },
  );

  it("FR-ONB-01: every missing field gets its own message", () => {
    const result = parseKycForm({}, NOW);

    expect(!result.ok && Object.keys(result.errors).sort()).toEqual([
      "accountType",
      "address",
      "dateOfBirth",
      "fullName",
      "mobileNumber",
      "nic",
    ]);
  });

  it("FR-ONB-01: an unknown field is refused, so nothing unvalidated is stored", () => {
    expect(parseKycForm(aKycForm({ monthlyIncome: 100_000 }), NOW).ok).toBe(false);
  });
});
