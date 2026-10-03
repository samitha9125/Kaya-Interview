import type { NewCustomer } from "@/server/modules/auth";
import { hashPassword } from "@/server/platform/crypto";

export const CUSTOMER_PASSWORD = "correct horse battery staple";

// Real scrypt at a low cost, hashed once per file: the stored hash carries
// its cost, so login verifies it for real, just faster.
const passwordHash = await hashPassword(CUSTOMER_PASSWORD, { cost: 2 ** 10 });

let sequence = 0;

// Generated, never real: a new-format NIC built from a running number.
function fakeNic(n: number): string {
  return `1990${String(100 + (n % 266)).padStart(3, "0")}${String(n).padStart(5, "0")}`;
}

export function aCustomer(overrides: Partial<NewCustomer> = {}): NewCustomer {
  sequence += 1;
  return {
    id: `customer-${sequence}`,
    customerNumber: `C${9000 + sequence}`,
    fullName: `Test Customer ${sequence}`,
    passwordHash,
    nic: fakeNic(sequence),
    mobileNumber: `0771${String(sequence).padStart(6, "0")}`,
    monthlyIncomeLkr: 150_000,
    monthlyRepaymentsLkr: 10_000,
    ...overrides,
  };
}
