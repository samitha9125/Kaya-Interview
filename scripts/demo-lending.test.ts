import { beforeEach, describe, expect, it } from "vitest";
import { decideLoan, findOpenApplication } from "@/server/modules/lending";
import type { DatabaseHandle } from "@/server/platform/db";
import { createTestDatabase } from "@/test/database";
import { fixedClock, TEST_ENCRYPTION_KEY } from "@/test/fakes";
import { DEMO_CUSTOMERS, seedDemoCustomers } from "./demo-customers";
import { DEMO_CREDIT, DEMO_TERMS, seedDemoCitizens, seedOpenApplication } from "./demo-lending";

const CONFIG = {
  APP_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
  AUTO_DECISION_THRESHOLD: 9_500,
  CREDIT_CACHE_TTL_DAYS: 30,
};
const now = fixedClock().now();

function customerOf(customerNumber: string) {
  return DEMO_CUSTOMERS.find((demo) => demo.customerNumber === customerNumber)!;
}

// The designed ending, decided by the real rules with a fresh score.
function endingFor({ customerNumber, score, terms }: (typeof DEMO_CREDIT)[number]) {
  const customer = customerOf(customerNumber);
  return decideLoan({
    ...(terms ?? DEMO_TERMS),
    monthlyIncomeLkr: customer.monthlyIncomeLkr,
    monthlyRepaymentsLkr: customer.monthlyRepaymentsLkr,
    credit: { score, hasHistory: score !== null, stale: false, fetchedAt: now },
    thresholdBp: CONFIG.AUTO_DECISION_THRESHOLD,
    now,
  }).outcome;
}

describe("seed: designed demo endings (FR-PLAT-07)", () => {
  it.each(DEMO_CREDIT.filter((row) => row.ending !== "open_application"))(
    "FR-PLAT-07: $customerNumber reaches $ending",
    (row) => {
      expect(endingFor(row)).toBe(row.ending);
    },
  );

  it("FR-PLAT-07: every designed ending has a demo customer", () => {
    const endings = new Set(DEMO_CREDIT.map((row) => row.ending));

    expect([...endings].sort()).toEqual(
      ["eligible", "not_eligible", "open_application", "referred"].sort(),
    );
  });

  it("FR-PLAT-07: every demo customer has a government record", () => {
    expect(DEMO_CREDIT.map((row) => row.customerNumber).sort()).toEqual(
      DEMO_CUSTOMERS.map((demo) => demo.customerNumber).sort(),
    );
  });
});

describe("seed: the government mock and the open application", () => {
  let handle: DatabaseHandle;
  const count = (sql: string) => handle.sqlite.prepare(sql).pluck().get();

  beforeEach(async () => {
    handle = createTestDatabase();
    await seedDemoCustomers(handle.db, TEST_ENCRYPTION_KEY, { cost: 2 ** 10 });
    seedDemoCitizens(handle.db);
    await seedOpenApplication(handle.db, CONFIG);
  });

  it("FR-PLAT-07: the mock knows every demo customer", () => {
    expect(count("SELECT count(*) FROM mock_gov_citizens")).toBe(DEMO_CUSTOMERS.length);
  });

  it("BR-LEND-08: one customer starts with an approved open application, and nobody else has one", () => {
    const withOpen = DEMO_CUSTOMERS.filter((demo) => findOpenApplication(handle.db, demo.id));

    expect(withOpen.map((demo) => demo.customerNumber)).toEqual(["C1005"]);
    expect(findOpenApplication(handle.db, customerOf("C1005").id)?.status).toBe("approved");
  });

  it("BR-CRED-03: seeding leaves the day's government budget untouched", () => {
    expect(count("SELECT attempts FROM gov_api_budget")).toBe(0);
  });

  it("FR-PLAT-07: re-running the seed adds no second application", async () => {
    seedDemoCitizens(handle.db);
    await seedOpenApplication(handle.db, CONFIG);

    expect(count("SELECT count(*) FROM loan_applications")).toBe(1);
  });
});
