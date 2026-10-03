import { createCustomer, type NewCustomer } from "@/server/modules/auth";
import { hashPassword } from "@/server/platform/crypto";
import { runInTransaction, type AppDatabase } from "@/server/platform/db";

// Every demo customer signs in with this password (README, demo
// credentials). Fine for a demo; a real bank issues its own.
export const DEMO_PASSWORD = "Demo@1234";

type DemoCustomer = Omit<NewCustomer, "passwordHash">;

// Made-up people and NICs. Each record is shaped, with the score in
// demo-lending.ts, for one demo ending; income and repayments are the
// bank's own record (SPEC A3).
export const DEMO_CUSTOMERS: DemoCustomer[] = [
  customer("C1001", "Nimal Perera", "198512300011", 250_000, 20_000),
  customer("C1002", "Kamala Silva", "197845600022", 120_000, 10_000),
  customer("C1003", "Sunil Fernando", "199020100033", 180_000, 30_000),
  customer("C1004", "Anoma Jayasinghe", "199531500044", 90_000, 0),
  customer("C1005", "Ruwan Bandara", "198810500055", 200_000, 15_000),
  customer("C1006", "Dilani Wickramasinghe", "199260200066", null, null),
  customer("C1007", "Chaminda Rathnayake", "198307700077", 100_000, 35_000),
  customer("C1008", "Ishara Gunasekara", "199718800088", 300_000, 0),
  customer("C1009", "Tharindu Herath", "199422200099", 220_000, 25_000),
  customer("C1010", "Sanduni Karunaratne", "199155500100", 160_000, 5_000),
];

function customer(
  customerNumber: string,
  fullName: string,
  nic: string,
  monthlyIncomeLkr: number | null,
  monthlyRepaymentsLkr: number | null,
): DemoCustomer {
  const n = customerNumber.slice(1);
  return {
    id: `cust-${n}`,
    customerNumber,
    fullName,
    nic,
    mobileNumber: `0770${n.padStart(6, "0")}`,
    monthlyIncomeLkr,
    monthlyRepaymentsLkr,
  };
}

// Safe to re-run: an existing customer is left as it is.
export async function seedDemoCustomers(
  db: AppDatabase,
  encryptionKey: Buffer,
  { cost }: { cost?: number } = {},
): Promise<void> {
  // One salted hash per customer, so equal passwords never share a hash.
  const records = await Promise.all(
    DEMO_CUSTOMERS.map(async (demo) => ({
      ...demo,
      passwordHash: await hashPassword(DEMO_PASSWORD, { cost }),
    })),
  );
  runInTransaction(db, (tx) => {
    for (const record of records) createCustomer(tx, record, encryptionKey);
  });
}
