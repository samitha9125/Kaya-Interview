import { cookies } from "next/headers";
import { findCustomerName, resolveSession } from "@/server/modules/auth";
import { app } from "@/server/composition";
import { SESSION_COOKIE } from "./http/session-cookie";

export type PageSession =
  { kind: "signed_out" } | { kind: "guest" } | { kind: "customer"; name: string };

// What the chat page needs to know about the visitor, and nothing more.
export async function readPageSession(): Promise<PageSession> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return { kind: "signed_out" };
  const deps = app();
  const resolved = resolveSession(token, deps);
  if (!resolved.ok) return { kind: "signed_out" };
  const { customerId } = resolved.session;
  if (!customerId) return { kind: "guest" };
  const name = findCustomerName(deps.db, customerId);
  return name ? { kind: "customer", name } : { kind: "signed_out" };
}
