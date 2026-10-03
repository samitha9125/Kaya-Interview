import { describe, expect, it } from "vitest";
import { createTestDatabase } from "@/test/database";
import { fixedClock } from "@/test/fakes";
import { mockGovIpCalls } from "./schema";
import { creditScore, type MockGovDeps } from "./service";

function mockGovSetup() {
  const { db } = createTestDatabase();
  const deps: MockGovDeps = {
    db,
    clock: fixedClock(),
    sleep: async () => undefined,
    isDemoMode: true,
    apiKey: "the-bank-key", // A made-up key. secret-scan:ignore
  };
  return { db, deps };
}

const ask = (headers: Record<string, string>) =>
  new Request("http://localhost/api/mock-gov/credit-score", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.1", ...headers },
    body: JSON.stringify({ nic: "199900000000" }), // secret-scan:ignore
  });

describe("mock-gov/creditScore: only the bank's key is answered", () => {
  it.each([
    { case: "no key", headers: {} as Record<string, string> },
    { case: "a wrong key", headers: { "x-api-key": "a-guess" } },
  ])("FR-MOCK-05: $case → 401, and the call isn't counted", async ({ headers }) => {
    const { db, deps } = mockGovSetup();

    const response = await creditScore(ask(headers), deps);

    expect(response.status).toBe(401);
    expect(db.select().from(mockGovIpCalls).all()).toEqual([]);
  });
});
