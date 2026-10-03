import { eq } from "drizzle-orm";
import { decryptField, encryptField } from "@/server/platform/crypto";
import type { DbExecutor } from "@/server/platform/db";
import { customers } from "./schema";

export type NewCustomer = {
  id: string;
  customerNumber: string;
  fullName: string;
  passwordHash: string;
  nic: string;
  mobileNumber: string;
  monthlyIncomeLkr: number | null;
  monthlyRepaymentsLkr: number | null;
};

export type CustomerRecord = typeof customers.$inferSelect;

// Customer numbers are typed by people: "c1001 " is C1001.
export function normalizeCustomerNumber(value: string): string {
  return value.trim().toUpperCase();
}

// Insert-or-keep: seeding is safe to re-run and never resets a customer's
// lockout state.
export function createCustomer(executor: DbExecutor, customer: NewCustomer, key: Buffer): void {
  const { nic, ...record } = customer;
  executor
    .insert(customers)
    .values({
      ...record,
      customerNumber: normalizeCustomerNumber(record.customerNumber),
      nicEncrypted: encryptField(nic, key),
    })
    .onConflictDoNothing()
    .run();
}

export function findCustomerByNumber(executor: DbExecutor, customerNumber: string) {
  return executor
    .select()
    .from(customers)
    .where(eq(customers.customerNumber, normalizeCustomerNumber(customerNumber)))
    .get();
}

export function findCustomerById(executor: DbExecutor, customerId: string) {
  return executor.select().from(customers).where(eq(customers.id, customerId)).get();
}

// Data minimisation: the chat screen needs the name and nothing else.
export function findCustomerName(executor: DbExecutor, customerId: string): string | undefined {
  return executor
    .select({ fullName: customers.fullName })
    .from(customers)
    .where(eq(customers.id, customerId))
    .get()?.fullName;
}

// Decrypted only for the one call that needs it: the government credit
// check (BR-AUTH-01). Never logged, never given to the LLM.
export function findCustomerNic(
  executor: DbExecutor,
  customerId: string,
  key: Buffer,
): string | undefined {
  const row = executor
    .select({ nicEncrypted: customers.nicEncrypted })
    .from(customers)
    .where(eq(customers.id, customerId))
    .get();
  return row ? decryptField(row.nicEncrypted, key) : undefined;
}
