import { describe, expect, it } from "vitest";
import { aCustomer } from "@/test/builders/customer";
import { createTestDatabase } from "@/test/database";
import { TEST_ENCRYPTION_KEY } from "@/test/fakes";
import { createCustomer, findBankRecord } from "./index";

describe("auth/findBankRecord (SPEC A3)", () => {
  it("SPEC A3: returns the income and repayments on the customer's record, and nothing else", () => {
    const { db } = createTestDatabase();
    const customer = aCustomer({ monthlyIncomeLkr: 180_000, monthlyRepaymentsLkr: null });
    createCustomer(db, customer, TEST_ENCRYPTION_KEY);

    expect(findBankRecord(db, customer.id)).toEqual({
      monthlyIncomeLkr: 180_000,
      monthlyRepaymentsLkr: null,
    });
  });

  it("SPEC A3: an unknown customer has no record", () => {
    const { db } = createTestDatabase();

    expect(findBankRecord(db, "nobody")).toBeUndefined();
  });
});
