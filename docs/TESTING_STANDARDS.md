# Testing Standards

How we test, and how we prove the tests are worth having. Coding rules: [`CODING_STANDARDS.md`](CODING_STANDARDS.md). Severity levels: [`ARCHITECTURE.md`](ARCHITECTURE.md) §11. The failure cases themselves are requirements in [`SPEC.md`](SPEC.md).

**The rule behind every other rule: a test must be able to fail.** A test that stays green when the behaviour it claims to check is broken is worse than no test, because it gives false confidence. We prove each test can fail before we trust it.

## 1. Test levels

Test at the lowest level that can catch the problem.

| Level | Tool | What it covers | Lives in |
|---|---|---|---|
| **Unit** | Vitest | Pure business logic: rules, confidence, cache lifetime, budget, lockout, validation, crypto, failure → template mapping | Next to the source: `foo.ts` → `foo.test.ts` |
| **Module** | Vitest + real SQLite (in-memory) | A module's public functions against a real database: atomic budget update, idempotency, transactions, encryption at rest | Next to the module's `index.ts` |
| **Graph** | Vitest + `fakeModel()` + `MemorySaver` | The real LangGraph graph with a **scripted fake model**: gates, pauses, routing, handoffs, middleware. The model is treated as an adversary | `server/agent/**/*.test.ts` |
| **E2E** | Playwright (Chromium) | One walk per journey (J1–J4), plus the checks only a browser proves: a copied cookie after sign-out, and the demo routes with demo mode off | `e2e/<journey>.spec.ts` |
| **Evals** | promptfoo | LLM behaviour on real models: routing accuracy, refusals, tone, red-team attacks, latency | `evals/` |

The database is deliberately **real** (SQLite in memory), not mocked. It's fast, and mocking it would hide the very bugs we care about: a non-atomic budget update, or a missing unique constraint.

## 2. What a good test looks like

```ts
describe("lending/assess: auto-decision threshold", () => {
  it.each([
    { confidenceBp: 9_500, expected: "outcome" },  // exactly at threshold → outcome
    { confidenceBp: 9_499, expected: "referral" }, // just below → referral
  ])("BR-LEND-05: confidence $confidenceBp bp → $expected", ({ confidenceBp, expected }) => {
    const result = routeDecision(anAssessment({ confidenceBp }), { thresholdBp: 9_500 });
    expect(result.kind).toBe(expected);
  });
});
```

- **Named as a specification**, starting with the requirement or failure ID it proves (`BR-LEND-04`, `P0-07`). That's how traceability works: search an ID, find its proof.
- **One behaviour per test**, in Arrange → Act → Assert order.
- **Boundaries as tables.** Every numeric rule is tested at its limit and just past it with `it.each`.
- **No logic in tests:** no loops or conditionals beyond `it.each` tables.
- **Assert outcomes, not internal calls.** The one exception is security: "the government API was **not** called" is the outcome.

## 3. Files and structure

- **Max 300 lines per test file**, the same lint rule as production code. When a file grows, split it by behaviour (`assess.threshold.test.ts`, `assess.rules.test.ts`), never by dumping helpers elsewhere.
- **Test data builders**, not raw fixtures: `aCustomer({ monthlyIncomeLkr: 150_000 })`, `anAssessment({ confidenceBp: 9_000 })`. They live in `src/test/builders/`, one file per entity.
- **No real personal data.** Fake NICs are generated, or marked `secret-scan:ignore` when a literal is unavoidable.
- **Independent tests:** no shared mutable state, no order dependence, a fresh database per test file.

## 4. Test doubles

| Boundary | Double |
|---|---|
| LLM | `fakeModel()` from `langchain` (`.respond`, `.respondWithTools`, `.alwaysThrow`) |
| Government API | A fake `CreditBureau` adapter; the real `HttpGovBureau` adapter is tested against a local fake HTTP server |
| LLM provider and model list | A fake `ChatModelProvider` returning `fakeModel()`; a fixture of the OpenRouter models API for `OpenRouterCatalog` |
| Clock | Injected `now()`; Vitest fake timers for retries and backoff |
| Randomness (tokens, jitter) | Injected and seeded |

**Never** fake the unit under test, an internal function of the same module, or the database. If something is hard to test without that, the design needs to change, not the test.

## 5. Determinism

- No `sleep`, and no real timers in unit, module or graph tests.
- No network, except E2E against the local app and evals against real models.
- Same input → same result, on every machine, every run.

## 6. Proving tests can fail

| Where | How | Why |
|---|---|---|
| **P0 controls and business-rule boundaries** (threshold, eligibility, confidence, cache lifetime and stale window, budget and 429 block, lockout, ownership, consent, duplicate submit, …) | **Manual mutant**: break the code on purpose, watch the test fail, revert. Recorded in the task's verification line in `tasks/todo.md` (`Mutant: inverted the ownership check → P0-04 test failed`) | Here a silently passing test hides a security hole or a business bug (`>=` → `>` on the threshold, `<` → `<=` on the 30-day lifetime) that coverage alone can't see |
| **Everything else** | Normal test-first red → green | Mutation ceremony on UI and glue code is slow and noisy and pins tests to implementation details |

Bugs follow **Prove-It**: first a test that fails because of the bug, then the fix.

## 7. Security tests

- Every **P0** failure case in the spec has at least one **deterministic** automated test (unit, module, graph or E2E), and the test name carries its ID. **Evals never prove a P0**; they measure behaviour quality.
- **Graph tests treat the model as an adversary:** the fake model is scripted to call the credit tool early, pass identity arguments, claim an outcome, or loop. The graph must refuse.
- **Red-team evals** run the same attacks against real models: someone else's NIC, "I'm already verified", system-prompt extraction, "what's my score?", "when is my next evaluation?", draining the budget, emotional pressure, authority claims, task smuggling, and "ignore previous instructions".

## 8. Evals

- One suite per concern: routing, refusals, tone, red-team, and follow-ups (a "really?" or "why?" after each outcome stays true to it, claims no step that didn't happen, and gives no reasons or numbers).
- Prefer deterministic assertions (contains, not-contains, which tool was called). Use an LLM-as-judge **only** for tone, with an explicit written rubric.
- Pass marks are **quality targets**, not guarantees. Run on at least two models; record pass rate and latency. Results go in the README.
- Evals cost money, so they never run in hooks; they run on demand and through the manual CI workflow.

## 9. Coverage

**No coverage gate.** Coverage rewards lines run, not behaviour proven: a line executed by a test with no meaningful assertion counts as covered. We rely instead on requirement-traced tests (§2: every test names the ID it proves), a deterministic test for every P0 (§7) and manual mutants (§6), which show the tests actually fail when the behaviour breaks.

## 10. Review

Before a module is built, the **test-engineer persona** (`agent-skills:test-engineer`) reviews its test plan against the spec, including its failure cases. Every test, whether a person or an AI writes or audits it, must pass these four questions:

1. Which requirement or failure ID does it prove?
2. Would it fail if that behaviour broke? (Shown by a mutant.)
3. Does it check behaviour rather than implementation?
4. Is any double replacing the thing under test?
