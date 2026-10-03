// Every state-changing call carries a fresh idempotency key (FR-WEB-01).
// The server's message is shown as it is: it's already a template.
export type ApiResult = { ok: true } | { ok: false; message: string };

export const FALLBACK =
  "We couldn't reach the bank just now. Please check your connection and try again.";

export async function postJson(
  url: string,
  body: Record<string, unknown> = {},
): Promise<ApiResult> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, idempotencyKey: crypto.randomUUID() }),
    });
    if (response.ok) return { ok: true };
    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    return { ok: false, message: payload?.error?.message ?? FALLBACK };
  } catch {
    return { ok: false, message: FALLBACK };
  }
}
