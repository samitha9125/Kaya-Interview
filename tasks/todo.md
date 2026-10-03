# Tasks: Bank Assistant

The checklist for [`plan.md`](plan.md). Tick a task when its acceptance and verification lines are met and the branch is merged into `develop`.

## Phase 0: Decisions record

- [x] **T0 · Write `DECISIONS.md`** (S). Business decisions (B), technical decisions (options → choice → trade-off), deferred items (D1–D11) and rejected items, from the recorded discussion. Includes the 30-day cache reasoning, router vs supervisor, models and cost, buffered replies, and no humanizer agent.
  *Accept:* every D-ID and decision cited by the SPEC and ARCHITECTURE exists; business and technical decisions are in separate sections. *Verify:* search each cited ID. *Deps:* none.

## Phase 1: Foundation and risk spikes

- [x] **T1 · Platform: config, crypto, logger** (M). zod env with fail-fast (FR-PLAT-01), AES-256-GCM + `scrypt` + token helpers (FR-PLAT-02), redacting JSON logger (FR-PLAT-06), `.env.example` updated.
  *Accept:* P0-16 test; tampered ciphertext fails; redaction table test. *Verify:* `pnpm test`; manual mutant: drop the threshold-range check → P0-16 fails. *Deps:* T0. *Files:* `server/platform/{config,crypto,logger}/*`, `.env.example`.
  *Result:* mutant: removed the 0–10000 range check → `P0-16: AUTO_DECISION_THRESHOLD 10001` failed; reverted. Also added `src/instrumentation.ts`, so a bad config stops `next start` and `next dev` (checked by hand: exit code 1).

- [ ] **T2 · Platform: database, audit, idempotency** (M). Drizzle + SQLite, migrations, `pnpm db:setup`, audit log (FR-PLAT-03), one-transaction helper (FR-PLAT-04), idempotency store (FR-PLAT-05), SQLite `busy_timeout` + retry (P2-06). **Proves the native SQLite stack and the LangGraph SQLite checkpointer install and run on Node 24.**
  *Accept:* P0-17 and idempotency module tests on in-memory SQLite. *Verify:* `pnpm db:setup && pnpm test`; manual mutant: split the transaction → P0-17 fails. *Deps:* T1.

- [ ] **T3 · Layer boundaries, skeleton and mutation tooling** (S). Directory skeleton, `server/composition.ts` stub, ESLint `no-restricted-imports` per layer (ARCHITECTURE §4), `server-only`. Stryker config + `pnpm test:mutation` (check Vitest 5 support first; scope starts empty).
  *Accept:* a deliberate forbidden import (module → LangChain) fails lint; `pnpm test:mutation` runs. *Verify:* `pnpm lint` on a temporary violation, then revert. *Deps:* T2.

- [ ] **T4 · Agent walking skeleton** (M, **highest risk**). A minimal parent graph proving the patterns before anything depends on them:
  - a `createAgent` specialist in a wrapper node handing off via `Command.PARENT`;
  - `interrupt()` resumed with a **reference** through a single-use ID;
  - a buffered-reply validation hook;
  - the SQLite checkpointer with `durability: "sync"`;
  - the graph-test harness (`fakeModel` + `MemorySaver`).

  *Accept:* graph tests for handoff, single-use resume (P0-09 shape) and reply replacement. *Verify:* `pnpm test`; findings recorded in ARCHITECTURE if anything differs from the docs. *Deps:* T2, T3.

### Checkpoint A: foundation
- [ ] All green; the three spike results are recorded; review with the user before Phase 2.

## Phase 2: Identity (sign in → chat shell)

- [ ] **T5 · Auth: login and lockout** (M). Seeded customers (FR-PLAT-07, auth part), login with `scrypt` (FR-AUTH-01), lockout (BR-AUTH-02), login rate limit (FR-AUTH-07).
  *Accept:* lockout boundary table 4/5/6 (P0-13); identical failure message; Stryker ≥ 80% on lockout. *Verify:* `pnpm test && pnpm test:mutation`. *Deps:* T2, T3.

- [ ] **T6 · Auth: sessions and ownership** (M). Hashed server-side sessions, `__Host-session` cookie, rotation, idle/absolute timeouts, revocation, guest sessions, conversation ownership (FR-AUTH-02…06).
  *Accept:* a DB row alone isn't a session; rotation invalidates the old token. *Verify:* `pnpm test`; manual mutant: skip the ownership check → P0-04 test fails. *Deps:* T5.

- [ ] **T7a · Harness request pipeline** (M). Origin check, session, zod, idempotency, rate limit, turn lock, NIC stripping, failure → template + reference, security headers (FR-WEB-01/02/03/05/06).
  *Accept:* P1-15; P0-02 (stripping); foreign origin → 403. *Verify:* `pnpm test`. *Deps:* T6.

- [ ] **T7b · Auth routes and chat shell** (M). Login/logout/guest routes, shadcn init, sign-in card, empty chat page.
  *Accept:* sign in, sign out, copied cookie rejected after logout. *Verify:* `pnpm test:e2e`. *Deps:* T7a.

### Checkpoint B: a customer can sign in and out securely

## Phase 3: Credit (scarce, unreliable bureau)

- [ ] **T8 · Mock government API** (M). Separate module and tables, `POST /api/mock-gov/credit-score`, per-IP 429 with `Retry-After`, failure modes, demo-only reset (FR-MOCK-01…04).
  *Accept:* each mode's response asserted. *Verify:* `pnpm test`. *Deps:* T2, T3.

- [ ] **T9 · `CreditBureau` port and HTTP adapter** (S). 5 s timeout, 404 → no history, other 4xx → failure, zod-validated responses (BR-CRED-06, FR-CRED-02).
  *Accept:* P0-11; tested against a local fake HTTP server. *Verify:* `pnpm test`. *Deps:* T8.

- [ ] **T10 · Credit policy** (M). 30-day cache, 90-day stale window, atomic daily budget, 429 block, retry with jitter, 15-minute cool-down, typed results, change tracking (BR-CRED-01…05, 07; FR-CRED-01, 03, 04).
  *Accept:* boundary tables; concurrent last-slot test (P1-04); Stryker ≥ 80% on BR-CRED-01…04 and FR-CRED-01. *Verify:* `pnpm test && pnpm test:mutation`. *Deps:* T9.

### Checkpoint C: credit policy proven by tests and mutation score

## Phase 4: Lending decisions

- [ ] **T11 · Eligibility rules and confidence** (M). Bands, repayment-to-income and the instalment formula in basis points, reasons, confidence heuristic, hard referral rules, threshold routing (BR-LEND-01…06). Pure functions.
  *Accept:* P0-07 and P0-08 boundary tables; Stryker ≥ 80% on BR-LEND-01…06. *Verify:* `pnpm test:mutation`. *Deps:* T3.

- [ ] **T12 · Assessments and applications** (M). Consent records, `loan_assessments`, endings, binding (30-minute validity, assessment ID = idempotency key), one open application, decision + audit in one transaction; seed outcome customers and their matching mock-gov citizens (BR-LEND-07…11, FR-LEND-01).
  *Accept:* P0-10, P0-12; replayed submit → same application (P0-09). *Verify:* `pnpm test`; manual mutants: drop the amount/term binding check → P0-12 fails; drop the idempotency key on submit → P0-09 fails. *Deps:* T5, T10, T11.

## Phase 5: Agent and journeys

- [ ] **T13 · Model provider, catalogue and settings module** (M). `ChatModelProvider` and `ModelCatalog` ports with OpenRouter adapters (ZDR, data-collection deny, China-hosted ignore list, reasoning low), defaults per role, settings module (FR-SET-01…03). **Checks with a real key whether the 400-token output limit counts reasoning tokens.**
  *Accept:* only tool-capable models listed; key status without the value. *Verify:* `pnpm test`; one live smoke call per default model. *Deps:* T4.

- [ ] **T14a · Loan flow (deterministic part)** (M). Step-up / consent / confirm pauses resolved by the route handler (references only), credit node with retry/timeout/errorHandler, decide routing, endings and templates (BR-AUTH-01, BR-AUTH-03, FR-AGT-05/06/13, BR-LEND-09/10 wiring).
  *Accept:* graph tests for P0-01, P0-03, P0-09, P0-19 with an adversarial fake model; a step-up older than 5 minutes re-prompts and a failed step-up counts toward lockout; nothing can force a fetch while a fresh cache entry exists (BR-CRED-07). *Verify:* `pnpm test`; manual mutants: let the model's tool call bypass consent → P0-03 fails; accept a used interrupt ID → P0-09 fails; write the raw password into state → P0-19 fails. *Deps:* T7b, T12, T13.

- [ ] **T14b · Loan agent** (M). Loan agent prompt and tone guide, `request_assessment` (no identity arguments), situation-label middleware (FR-AGT-02/04/08).
  *Accept:* P1-09; tool schemas contain no identity fields; each failure reason maps to its label. *Verify:* `pnpm test`. *Deps:* T14a.

- [ ] **T14c · Reply safety and limits** (M). Reply buffering and validation, output PII check, call limits, model retry, pressure resistance (FR-AGT-07/09/10/11/12, BR-AGT-01).
  *Accept:* graph tests for P0-05, P0-06, P0-18; P1-06/07/10. *Verify:* `pnpm test`. *Deps:* T14b.

- [ ] **T15 · Chat transport and loan UI** (M). Server-sent events (typing, progress, message, interrupt, error, done; FR-WEB-04), starter buttons, step-up / consent / confirm cards, reference code display.
  *Accept:* J1 E2E: eligible → approved, not eligible, referral, unavailable today; input locked during a turn (P1-15); reload restores the conversation (P1-11); keyboard-only and labelled inputs (FR-WEB-07). *Verify:* `pnpm test:e2e`. *Deps:* T7b, T14c.

### Checkpoint D: J1 works end to end. Review with the user.

- [ ] **T16 · Onboarding module** (S). KYC field and NIC validation, enumeration-safe response, encrypted draft → confirm → unverified pending application (FR-ONB-01/02, BR-ONB-01/02).
  *Accept:* P0-14; NIC tables for both formats. *Verify:* `pnpm test`. *Deps:* T2, T3.

- [ ] **T17 · KYC journey** (M). KYC agent, `start_account_opening`, form card posting to the server, draft reference resume, confirm (FR-AGT-03, BR-ONB-03).
  *Accept:* P0-19 for form data; J2 E2E. *Verify:* `pnpm test && pnpm test:e2e`; manual mutant: resume with the raw form instead of the draft ID → P0-19 fails. *Deps:* T15, T16.

- [ ] **T18 · Triage, callbacks and hand-back** (M). Triage with structured output, sticky routing, starter-button bypass, callback request and form, topic change / misroute hand-back (FR-AGT-01, 14, 15).
  *Accept:* a starter button costs no triage call; J3 E2E. *Verify:* `pnpm test && pnpm test:e2e`. *Deps:* T17.

- [ ] **T19 · Settings page and demo controls** (M). Model pickers with price and context, key status, threshold display, reset the government limit, clear the cache, failure mode; all gated by `DEMO_MODE` (FR-SET-04/05, BR-SET-01).
  *Accept:* P0-15; J4 E2E; each failure mode demonstrable from the UI. *Verify:* `pnpm test:e2e`. *Deps:* T7b, T10, T13, T18.

### Checkpoint E: all four journeys work; every P0 has a passing deterministic test

## Phase 6: Evidence and delivery

- [ ] **T20 · Evals** (M). promptfoo provider that calls the graph; suites for routing, refusals, red-team and tone (written rubric, FR-AGT-16, including a non-English message, P2-04); run on the defaults plus one Claude and one GPT model; record pass rates and latency.
  *Accept:* targets met on the defaults; results table ready for the README. *Verify:* `pnpm eval`. *Deps:* T19.

- [ ] **T21 · Security and test audit** (S). Run the `security-auditor` and `test-engineer` personas over the code and tests; fix findings; confirm the manual-mutant log covers every P0 outside Stryker.
  *Accept:* no open P0 or high findings. *Verify:* full suite + `pnpm test:mutation`. *Deps:* T20.

- [ ] **T22 · Documentation** (M). README (setup, demo credentials, bring your own key, demo script for J1–J4, audit query, eval results), PNG diagrams (plus the agent graph exported from code), `PROCESS.md`, CHANGELOG, final pass over ARCHITECTURE and SPEC.
  *Accept:* a fresh clone works by following the README alone. *Verify:* clone into a temp folder → follow the README → demo script passes. *Deps:* T21.

- [ ] **T23 · Release** (XS). Merge `develop` → `main` (merge commit), tag `v1.0.0`, push.
  *Accept:* CI green on `main`. *Deps:* T22.

### Checkpoint F: complete. Every SPEC §12 success criterion is ticked.

