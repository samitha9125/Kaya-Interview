// Old NIC format (9 digits + V/X) and new (12 digits), not inside a longer
// run, so phone numbers and references stay readable.
const NIC_PATTERN = /(?<![\dA-Za-z])(?:\d{9}[VvXx]|\d{12})(?![\dA-Za-z])/g;

// Matched against the end of the key with case and punctuation removed, so
// "sessionToken", "token_hash" and "set-cookie" are caught but
// "inputTokens" (a token count) is not.
const SENSITIVE_KEY_ENDINGS = [
  "password",
  "token",
  "tokenhash",
  "secret",
  "apikey",
  "authorization",
  "cookie",
  "nic",
  "score",
];

export const REDACTED = "[REDACTED]";

export function redactText(text: string): string {
  return text.replace(NIC_PATTERN, "[NIC]");
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return SENSITIVE_KEY_ENDINGS.some((ending) => normalized.endsWith(ending));
}

function redactValue(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === "string") return redactText(value);
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redactValue(item, seen));
  const source =
    value instanceof Error
      ? { name: value.name, message: value.message, stack: value.stack }
      : (value as Record<string, unknown>);
  return Object.fromEntries(
    Object.entries(source).map(([key, item]) => [
      key,
      isSensitiveKey(key) ? REDACTED : redactValue(item, seen),
    ]),
  );
}

export function redact(fields: Record<string, unknown>): Record<string, unknown> {
  return redactValue(fields, new WeakSet()) as Record<string, unknown>;
}
