import { randomBytes, randomUUID } from "node:crypto";

export type IdGenerator = { newId: () => string };

export const randomIds: IdGenerator = { newId: () => randomUUID() };

// No 0/O or 1/I/L: the first characters are the reference a customer
// reads out to support (FR-WEB-05).
const READABLE = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CORRELATION_LENGTH = 16;

export function newCorrelationId(): string {
  return Array.from(
    randomBytes(CORRELATION_LENGTH),
    (byte) => READABLE[byte % READABLE.length],
  ).join("");
}

export const REFERENCE_LENGTH = 4;

export function referenceFor(correlationId: string): string {
  return correlationId.slice(0, REFERENCE_LENGTH);
}
