// Narrows a typed result to its success case, failing the test otherwise,
// so test bodies stay free of conditionals.
export function expectOk<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result)}`);
  return result as Extract<T, { ok: true }>;
}
