# Coding Standards

The rules every change follows, whoever or whatever writes it. Testing has its own document: [`TESTING_STANDARDS.md`](TESTING_STANDARDS.md). Where things live and why: [`ARCHITECTURE.md`](ARCHITECTURE.md).

Tooling enforces what it can (TypeScript strict, ESLint, Prettier, hooks). This document covers the rest.

## 1. Principles

1. **The LLM talks, code decides.** Identity, money, consent and data access are deterministic code paths.
2. **Simple over clever.** Prefer the obvious solution a reviewer understands in one read.
3. **Boundaries are explicit.** Every external input is validated, every module exposes one public `index.ts`, and nothing leaks across layers.

## 2. TypeScript

| Rule | Detail |
|---|---|
| Strict mode | `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`. Don't weaken `tsconfig.json` |
| No `any` | Use `unknown` and narrow it with zod or type guards. ESLint blocks `any` |
| No non-null assertions (`!`) in production code | Handle the `undefined` case. Allowed in tests |
| Type-only imports | `import type { … }` (ESLint enforces) |
| Unions over enums | String literal unions (`"eligible" \| "not_eligible"`), not TS `enum` |
| Named exports | Except where Next.js requires a default export (pages, layouts) |
| Money and ratios | Integer LKR (`amountLkr`) and integer basis points for ratios and confidence (`9_500` = 95%). Never floats at a business boundary |
| Time | Injected `now: () => Date` for any time-based logic; never call `Date.now()` inside business rules |
| Constants | Business numbers (limits, lifetimes, thresholds) live in one `config.ts` per module, or come from validated env. No magic numbers in logic |
| File size | Max **300 lines** (ESLint `max-lines`). Split by responsibility before you hit it |
| Function size | Aim for under ~40 lines; extract when a function does two things |

**Naming:** files `kebab-case.ts`; types `PascalCase`; functions and variables `camelCase`, starting with a verb for functions (`fetchScore`, `assessEligibility`); booleans `is/has/can…`; env-derived constants `UPPER_SNAKE_CASE`. Names say what something *is*.

**Comments:** only where a decision or a practice needs explaining (the *why*: a business rule's source, a security reason, a deliberate trade-off). Never narrate what the code does. Never describe a bug fix in a comment; that belongs in the commit message.

## 3. Expected failures are values, not exceptions

Business outcomes and expected failures are returned as **typed results**. Exceptions are reserved for bugs and truly unexpected states. That keeps every failure path visible to the type checker and to reviewers.

```ts
// server/modules/gov-credit/types.ts
export type ScoreResult =
  | { ok: true; score: number; fetchedAt: Date; stale: boolean }
  | { ok: false; reason: "budget_exhausted" | "blocked" | "cooling_down" | "unavailable" };

// server/modules/gov-credit/get-score.ts
export async function getScore(customerId: string, deps: GovCreditDeps): Promise<ScoreResult> {
  const cached = await deps.cache.find(customerId);
  if (cached && isFresh(cached, deps.now())) {
    return { ok: true, score: cached.score, fetchedAt: cached.fetchedAt, stale: false };
  }
  const slot = await deps.budget.take(deps.now()); // atomic; never a 6th call
  if (!slot.ok) return staleOr(cached, slot.reason, deps.now());
  return fetchAndCache(customerId, deps.bureau, deps); // deps.bureau: CreditBureau port
}
```

- Dependencies (ports such as `CreditBureau`, the budget store, the clock) are passed in, so tests can supply fake adapters at the boundaries.
- The agent maps a `reason` to a situation label. It never forwards the raw value to the LLM.

## 4. Modules and imports

- Each module in `server/modules/<id>/` exposes **only** `index.ts`. Other code never deep-imports a module's internal files.
- Layer rules are in `ARCHITECTURE.md` §4 and enforced by ESLint `no-restricted-imports`. Key rule: **domain modules never import LangChain or LangGraph**, so business logic runs and tests with no model at all.
- **Depend on ports, not adapters.** A module that needs an external system declares a port (a TypeScript type in `ports.ts`) and receives an implementation. Concrete adapters live in `server/adapters/` and are wired only in `server/composition.ts`. Adding a provider or endpoint means adding an adapter, never editing domain logic.
- A module owns its tables. Only the owner writes them; other modules call the owner's public functions.
- Server-only code imports `server-only`, so it can't be bundled into the browser.

## 5. Validation

zod at **every** boundary, with types inferred from the schema (`z.infer<typeof Schema>`):

| Boundary | Example |
|---|---|
| HTTP request bodies | `/api/chat`, `/api/chat/resume`, login |
| Environment | Parsed once at startup; invalid security config stops the app |
| Government API responses | A malformed or out-of-range score is a failure, never a score |
| Tool arguments | The amount and term from the LLM |
| Interrupt resumes | `interrupt(payload, { responseSchema })` |

## 6. Agent and LangGraph rules

- **Identity comes from `runtime.context`, never from tool arguments.** No tool accepts a customer ID, NIC, or anything identifying.
- **The LLM gets the least information possible.** Tools return situation labels and human hints only (see `ARCHITECTURE.md` §11). Never error messages, codes, stack traces, provider names, numbers from the budget or cache, scores, thresholds or confidence.
- **Customer-facing critical text comes from templates** (outcomes, referrals, failures), not from the LLM.
- **Prompts** live in `server/agent/prompts/`, one file per role plus a shared tone guide, each with a `PROMPT_VERSION` constant recorded in the audit log.
- **Official docs only.** Before using any LangChain/LangGraph API, check the live official docs for our pinned versions (the `langchain-docs` MCP server). No undocumented APIs; anything considered and declined goes in `DECISIONS.md`.
- One `createAgent` per role, each with its own tools, prompt and model. No shared global tool list.
- **Interrupt resumes carry server-verified references** (`{ verified: true }`, a consent or draft ID), never passwords or form data. A node that calls `interrupt()` does nothing before it.
- **Side effects inside the graph are idempotent**, keyed by business identity (conversation + assessment), never a random value.
- **LLM replies are validated before they're sent** to the browser. No token streaming of LLM text.

## 7. Security

- Never log or audit secrets, passwords, raw NICs, KYC fields or scores. The logger redacts; don't work around it.
- No raw error text ever reaches the browser or the LLM. The harness maps failures to templates and a reference code.
- Database access goes through Drizzle (parameterised); no string-built SQL.
- Encryption, hashing and token generation come only from `server/platform/crypto`.
- Every state-changing route checks origin, session, idempotency key, and (for conversations) thread ownership.
- Secrets live only in env. `.env*` files are never committed; the pre-commit secret scan enforces this.

## 8. UI

- shadcn/ui components (`components/ui/`) and Tailwind. Customise through theme tokens, not by editing generated components.
- Server Components by default; `"use client"` only where interaction needs it.
- Accessible by default: every input has a label, everything works by keyboard, contrast meets WCAG AA.
- No business logic in components. They render state and call route handlers.
- Copy is plain, warm, and short (the tone guide applies to UI text too).

## 9. Logging and audit

| Use | When |
|---|---|
| `audit.record(event)` | Anything a bank would need to prove later: messages, login, step-up, consent, tool calls, decisions (with confidence and threshold used), government calls, budget changes |
| `logger.info/warn/error` | Operational detail for debugging, with the correlation ID |

Decisions and their audit records are written in the **same transaction**. No decision exists without its audit trail.

## 10. Dependencies

Ask before adding a dependency. Prefer platform built-ins (Node `crypto`, `scrypt`) and what's already installed. Any added dependency gets a one-line entry in `DECISIONS.md`.
