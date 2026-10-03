import { randomUUID } from "node:crypto";

export type IdGenerator = { newId: () => string };

export const randomIds: IdGenerator = { newId: () => randomUUID() };
