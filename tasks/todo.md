# Tasks: Bank Assistant

The checklist for [`plan.md`](plan.md). Tick a task when its acceptance and verification lines are met and the branch is merged into `develop`.

## Phase 0: Decisions record

- [x] **T0 · Write `DECISIONS.md`** (S). Business decisions (B), technical decisions (options → choice → trade-off), deferred items (D1–D11) and rejected items, from the recorded discussion. Includes the 30-day cache reasoning, router vs supervisor, models and cost, buffered replies, and no humanizer agent.
  *Accept:* every D-ID and decision cited by the SPEC and ARCHITECTURE exists; business and technical decisions are in separate sections. *Verify:* search each cited ID. *Deps:* none.

## Phase 1: Foundation and risk spikes

- [x] **T1 · Platform: config, crypto, logger** (M). zod env with fail-fast (FR-PLAT-01), AES-256-GCM + `scrypt` + token helpers (FR-PLAT-02), redacting JSON logger (FR-PLAT-06), `.env.example` updated.
  *Accept:* P0-16 test; tampered ciphertext fails; redaction table test. *Verify:* `pnpm test`; manual mutant: drop the threshold-range check → P0-16 fails. *Deps:* T0. *Files:* `server/platform/{config,crypto,logger}/*`, `.env.example`.
  *Result:* mutant: removed the 0–10000 range check → `P0-16: AUTO_DECISION_THRESHOLD 10001` failed; reverted. Also added `src/instrumentation.ts`, so a bad config stops `next start` and `next dev` (checked by hand: exit code 1).

- [x] **T2 · Platform: database, audit, idempotency** (M). Drizzle + SQLite, migrations, `pnpm db:setup`, audit log (FR-PLAT-03), one-transaction helper (FR-PLAT-04), idempotency store (FR-PLAT-05), SQLite `busy_timeout` + retry (P2-06). **Proves the native SQLite stack and the LangGraph SQLite checkpointer install and run on Node 24 (re-run on Node 25 at Checkpoint A).**
  *Accept:* P0-17 and idempotency module tests on in-memory SQLite. *Verify:* `pnpm db:setup && pnpm test`; manual mutant: split the transaction → P0-17 fails. *Deps:* T1.
  *Result:* mutant: wrote the decision and the audit record in two transactions → `P0-17: a failed audit write leaves no decision stored` failed; reverted. Extra mutant: dropped the stored-key lookup → the FR-PLAT-05 replay test failed; reverted. Spike: better-sqlite3 12.11.1 and `SqliteSaver` run on Node 24.21.0 (needs `better-sqlite3` in `onlyBuiltDependencies`); a checkpointed thread survives closing and reopening the file. Re-run on Node 25.2.1 at Checkpoint A (TD20): `pnpm rebuild better-sqlite3`, then `pnpm db:setup` and the full suite pass.

- [x] **T3 · Layer boundaries, skeleton and mutation tooling** (S). Directory skeleton, `server/composition.ts` stub, ESLint `no-restricted-imports` per layer (ARCHITECTURE §4), `server-only`. Stryker config + `pnpm test:mutation` (check Vitest 5 support first; scope starts empty).
  *Accept:* a deliberate forbidden import (module → LangChain) fails lint; `pnpm test:mutation` runs. *Verify:* `pnpm lint` on a temporary violation, then revert. *Deps:* T2.
  *Result:* temporary violations all failed lint (module → LangChain/LangGraph, relative imports from a module and from platform up into the agent, a deep import into a module, app → platform, adapter → agent internals) and were removed. Uses `import/no-restricted-paths` as well as `no-restricted-imports`, because the latter can't see through relative paths. Spike: Stryker 10 with the Vitest runner works on Vitest 5.0.3 (trial run killed 17 mutants; the 80% break threshold failed the run as it should); with the empty scope, `pnpm test:mutation` exits 0.

- [x] **T4 · Agent walking skeleton** (M, **highest risk**). A minimal parent graph proving the patterns before anything depends on them:
  - a `createAgent` specialist in a wrapper node handing off via `Command.PARENT`;
  - `interrupt()` resumed with a **reference** through a single-use ID;
  - a buffered-reply validation hook;
  - the SQLite checkpointer with `durability: "sync"`;
  - the graph-test harness (`fakeModel` + `MemorySaver`).

  *Accept:* graph tests for handoff, single-use resume (P0-09 shape) and reply replacement. *Verify:* `pnpm test`; findings recorded in ARCHITECTURE if anything differs from the docs. *Deps:* T2, T3.
  *Result:* every pattern worked as documented, so no fallback was needed; ARCHITECTURE §7 records how each is used. Mutants (all reverted): removed `graph: Command.PARENT` → 8 tests failed, including the FR-AGT-05 handoff tests; skipped the pending-ID check → `P0-09: a replayed resume is refused` failed; skipped the reference check → the four P0-19 resume tests failed; skipped the wording check → `P0-05` failed. Finding for T14a/T15: a chat message sent while a pause is pending starts a new run from START and drops the pause (documented LangGraph behaviour), so the harness needs a rule for it.

### Checkpoint A: foundation
- [x] All green; the three spike results are recorded; review with the user before Phase 2.
  *Result:* reviewed. The user's decisions: Node 25 (TD20), no PRs (TD21), no coverage gate (TD16), and a pending pause refuses chat messages (TD14, FR-WEB-03).

## Phase 2: Identity (sign in → chat shell)

- [x] **T5 · Auth: login and lockout** (M). Seeded customers (FR-PLAT-07, auth part), login with `scrypt` (FR-AUTH-01), lockout (BR-AUTH-02), login rate limit (FR-AUTH-07).
  *Accept:* lockout boundary table 4/5/6 (P0-13); identical failure message; Stryker ≥ 80% on lockout. *Verify:* `pnpm test && pnpm test:mutation`. *Deps:* T2, T3.
  *Result:* Stryker 96.97% on `lockout.ts` (the one survivor is equivalent). Unknown number, wrong password and locked account return the same result; the audit trail keeps the reason. Mutant: let a correct password skip the lock check → five P0-13/BR-AUTH-02 login tests failed; reverted. Finding: with per-test coverage, Stryker 10's Vitest runner selected no tests on Vitest 5 (`suite test` vs `suite > test`), so every per-test mutant survived and the T3 trial's kills were static mutants only. Fixed with a one-line `pnpm patch` (TD19). The seed (`pnpm db:setup`) runs through `tsx`, a new dev dependency (TD19).

- [x] **T6 · Auth: sessions and ownership** (M). Hashed server-side sessions, `__Host-session` cookie, rotation, idle/absolute timeouts, revocation, guest sessions, conversation ownership (FR-AUTH-02…06).
  *Accept:* a DB row alone isn't a session; rotation invalidates the old token. *Verify:* `pnpm test`; manual mutant: skip the ownership check → P0-04 test fails. *Deps:* T5.
  *Result:* mutant: dropped the owner condition from the conversation lookup → the four P0-04 tests failed; reverted. Step-up (password check, token rotation, 5-minute freshness) landed here with the other session rules, so T14a only wires it into the graph. The `__Host-session` cookie itself is set by the routes (T7a/T7b), where its flags are asserted.

- [x] **T7a · Harness request pipeline** (M). Origin check, session, zod, idempotency, rate limit, turn lock, NIC stripping, failure → template + reference, security headers (FR-WEB-01/02/03/05/06).
  *Accept:* P1-15; P0-02 (stripping); foreign origin → 403. *Verify:* `pnpm test`. *Deps:* T6.
  *Result:* mutant: skipped the origin check → both FR-WEB-01 403 tests failed; reverted. NIC detection now also catches spaced and dashed NICs and is shared with the logger. Security headers come from Next.js Proxy with a per-request CSP nonce; the E2E header assertions land with the first real page in T7b. The pending-pause 409 joins the turn guard in T14a, once the graph can be asked.

- [x] **T7b · Auth routes and chat shell** (M). Login/logout/guest routes, shadcn init, sign-in card, empty chat page.
  *Accept:* sign in, sign out, copied cookie rejected after logout. *Verify:* `pnpm test:e2e`. *Deps:* T7a.
  *Result:* E2E green on the dev server and on the production build (7 specs, including cookie flags, the security headers and a foreign-origin 403), which shows the nonce CSP lets the app's scripts run. The E2E server uses its own port and a fresh database (`DATABASE_PATH`), and `db:setup` became one migrate-and-seed script so both steps use the same file.

### Checkpoint B: a customer can sign in and out securely
- [x] All green (lint, typecheck, 283 unit/module/graph tests, 7 E2E specs). Sign-in, lockout, sessions, sign-out, guests and ownership are proven; the security headers are asserted in a browser.

## Phase 3: Credit (scarce, unreliable bureau)

- [x] **T8 · Mock government API** (M). Separate module and tables, `POST /api/mock-gov/credit-score`, per-IP 429 with `Retry-After`, failure modes, demo-only reset (FR-MOCK-01…04).
  *Accept:* each mode's response asserted. *Verify:* `pnpm test`. *Deps:* T2, T3.
  *Result:* 22 tests, one per mode and rule. Mutant: counted the 5th call as over the limit → `FR-MOCK-02: call 5 … → 200` failed; reverted. Citizens are keyed by a NIC hash, so no NIC is plain text even in the mock's tables. The admin controls are `POST /api/mock-gov/admin/reset` and `/admin/failure-mode`; only `app/api/mock-gov` may import the mock (lint-enforced, ARCHITECTURE §4).

- [x] **T9 · `CreditBureau` port and HTTP adapter** (S). 5 s timeout, 404 → no history, other 4xx → failure, zod-validated responses (BR-CRED-06, FR-CRED-02).
  *Accept:* P0-11; tested against a local fake HTTP server. *Verify:* `pnpm test`. *Deps:* T8.
  *Result:* 28 tests through a real local HTTP server. Mutant: loosened the response schema to any number → four P0-11 tests failed; reverted. The adapter is wired into the composition root with the credit policy in T10.

- [x] **T10 · Credit policy** (M). 30-day cache, 90-day stale window, atomic daily budget, 429 block, retry with jitter, 15-minute cool-down, typed results, change tracking (BR-CRED-01…05, 07; FR-CRED-01, 03, 04).
  *Accept:* boundary tables; concurrent last-slot test (P1-04); Stryker ≥ 80% on BR-CRED-01…04 and FR-CRED-01. *Verify:* `pnpm test && pnpm test:mutation`. *Deps:* T9.
  *Result:* Stryker 97.09% on the scope (lockout, credit policy, budget, `getScore`); the five survivors are equivalent. The first run's survivors showed three real gaps (the 429 call's own reason, the audit of a failure's cause, a customer with no NIC), now tested. P1-04 is proven twice: in-process, and with two real connections to one file. The adapter is wired in the composition root behind `GOV_API_BASE_URL` (https, or plain http only to localhost).

### Checkpoint C: credit policy proven by tests and mutation score
- [x] All green (398 tests); Stryker 97.09% over lockout and the credit policy.

## Phase 4: Lending decisions

- [x] **T11 · Eligibility rules and confidence** (M). Bands, repayment-to-income and the instalment formula in basis points, reasons, confidence heuristic, hard referral rules, threshold routing (BR-LEND-01…06). Pure functions.
  *Accept:* P0-07 and P0-08 boundary tables; Stryker ≥ 80% on BR-LEND-01…06. *Verify:* `pnpm test:mutation`. *Deps:* T3.
  *Result:* Stryker 96.92% over the whole scope, 100% on `decide.ts`. The first run exposed two real gaps (a record claiming history with no score, and the not-eligible provisional outcome), now tested; the remaining survivors are equivalent (a band-D fallback that can't be reached, a band edge of 0 that no score is near). Instalments are checked against independently computed amortised payments.

- [x] **T12 · Assessments and applications** (M). Consent records, `loan_assessments`, endings, binding (30-minute validity, assessment ID = idempotency key), one open application, decision + audit in one transaction; seed outcome customers and their matching mock-gov citizens (BR-LEND-07…11, FR-LEND-01).
  *Accept:* P0-10, P0-12; replayed submit → same application (P0-09). *Verify:* `pnpm test`; manual mutants: drop the amount/term binding check → P0-12 fails; drop the idempotency key on submit → P0-09 fails. *Deps:* T5, T10, T11.
  *Result:* mutants (all reverted): dropped the amount/term binding check → the three P0-12 changed-terms tests failed; dropped the submit's lookup by assessment ID → both P0-09 replay tests failed; dropped the consent's customer and conversation binding → both BR-LEND-07 tests failed. `assessLoan` runs consent check → credit check → rules inside lending, so the score never reaches graph state; the consent ID is the assessment's idempotency key and the assessment ID the submit's. A partial unique index backs "one open application". Seed: each demo customer's score is chosen for one ending, checked by a test through the real rules; C1005's open application is made through the real flow and the budget slot given back. Finding: under BR-LEND-04 an amount above the band maximum also counts as "≥ 90% of the band maximum", so `amount_above_limit` was always referred at the default threshold. The user limited the penalty to 90–100% of the maximum (B19, `fix/lending-band-max-penalty`), and C1009 now demos a final amount-above-limit.

## Phase 5: Agent and journeys

- [x] **T13 · Model provider, catalogue and settings module** (M). `ChatModelProvider` and `ModelCatalog` ports with OpenRouter adapters (ZDR, data-collection deny, China-hosted ignore list, reasoning low), defaults per role, settings module (FR-SET-01…03). **Checks with a real key whether the 400-token output limit counts reasoning tokens.**
  *Accept:* only tool-capable models listed; key status without the value. *Verify:* `pnpm test`; one live smoke call per default model. *Deps:* T4.
  *Result:* live smoke check run in T20 (`pnpm smoke:models`): all three defaults answer through the adapter. **Reasoning tokens count toward the output limit**: GLM 5.3 Flash at `low` used 197 of its 400 output tokens on reasoning (`finish_reason: length`), GPT-5.6 Luna 46 of 400. Loan and KYC now get 400 tokens of headroom on top of the 400 visible (TD6). Gemini's long stress list was cut off upstream (`finish_reason: error`); short prompts finish normally, and triage only returns a short structured answer. Both adapters are tested against local HTTP servers. Mutants (all reverted): dropped the tool-support filter → the FR-SET-02 listing test failed; sent `zdr: false` → the privacy test failed; removed `maxRetries: 0` → the FR-AGT-12 no-own-retries test failed (LangChain retries 6 times by default). The port takes model, reasoning effort and output limit rather than a role (ARCHITECTURE §5). Each conversation stores the models it started with (FR-SET-01, P2-05); SQLite can't add a NOT NULL column, so that migration rebuilds the table by hand.

- [x] **T14a · Loan flow (deterministic part)** (M). Step-up / consent / confirm pauses resolved by the route handler (references only), credit node with retry/timeout/errorHandler, decide routing, endings and templates (BR-AUTH-01, BR-AUTH-03, FR-AGT-05/06/13, BR-LEND-09/10 wiring).
  *Accept:* graph tests for P0-01, P0-03, P0-09, P0-19 with an adversarial fake model; a step-up older than 5 minutes re-prompts and a failed step-up counts toward lockout; a chat message while a pause is pending → 409 and the pause is kept (P1-15); nothing can force a fetch while a fresh cache entry exists (BR-CRED-07). *Verify:* `pnpm test`; manual mutants: let the model's tool call bypass consent → P0-03 fails; accept a used interrupt ID → P0-09 fails; write the raw password into state → P0-19 fails. *Deps:* T7b, T12, T13.
  *Result:* mutants (all reverted): sent the gate straight to the credit check → the P0-03 and BR-LEND-07 order tests failed (8 in all); let a resume through without matching its interrupt ID → `P0-09: a replayed resume is refused` and both FR-AGT-06 ID tests failed; loosened the step-up reference and resumed with the password → `P0-19: … the password is nowhere in the database, checkpoints included` failed (it reads every row of every table). Step-up freshness is checked against the session by ID at the gate, before the score is used and at submit, so a forged "verified" re-prompts. Rules run inside lending's `assessLoan`, so the credit-check node is also the decide step and the score never enters state. The routes return JSON for now; T15 moves the same content to SSE.

- [x] **T14b · Loan agent** (M). Loan agent prompt and tone guide, `request_assessment` (no identity arguments), situation-label middleware (FR-AGT-02/04/08).
  *Accept:* P1-09; tool schemas contain no identity fields; each failure reason maps to its label. *Verify:* `pnpm test`. *Deps:* T14a.
  *Result:* the P1-09 test first failed for a real reason: the agent's default tool-error handling sent the LLM the schema parser's message with the refused arguments. Under middleware that failure arrives as a `ToolInvocationError`; the label middleware now matches it (TD18). Each ending swaps the model's own tool result for its situation label by message ID, so the LLM sees a label next to the template the customer saw. The tool schema is `amountLkr` and `termMonths` only, asserted from its JSON schema.

- [x] **T14c · Reply safety and limits** (M). Reply buffering and validation, output PII check, call limits, model retry, pressure resistance (FR-AGT-07/09/10/11/12, BR-AGT-01).
  *Accept:* graph tests for P0-05, P0-06, P0-18; P1-06/07/10. *Verify:* `pnpm test`. *Deps:* T14b.
  *Result:* the P0-18 test exposed a real hole: once any decision existed, the reply check let all decision wording through, so "you're approved" could follow "not eligible". Claims are now held to the decision in state. Mutant: turned off the PII middleware's output check → the P0-06 NIC-redaction test failed; reverted. Per-turn limits use the built-in middlewares; the per-conversation 60/20 come from the checkpointed history, because the built-ins' thread limits need the agent's own checkpointer. Code-written replies are authored as "bank" so they aren't counted as model calls.

- [x] **T15 · Chat transport and loan UI** (M). Server-sent events (typing, progress, message, interrupt, error, done; FR-WEB-04), starter buttons, step-up / consent / confirm cards, reference code display.
  *Accept:* J1 E2E: eligible → approved, not eligible, referral, unavailable today; input locked during a turn and while a pause is pending (P1-15); reload restores the conversation (P1-11); keyboard-only and labelled inputs (FR-WEB-07). *Verify:* `pnpm test:e2e`. *Deps:* T7b, T14c.
  *Result:* 14 E2E specs green, 7 of them J1. Mutants (all reverted): removed the chat input's lock → the P1-15 E2E test failed; let a model reply waiting for `validate_reply` into the transcript → the FR-AGT-10 transcript test failed; skipped the turn-lock release at the end of a stream → the FR-WEB-03 and P1-11 stream tests failed; put the raw error in the `error` event → the FR-WEB-05 test failed. Refusals (403/401/404/409) are still HTTP statuses before any stream starts; a stream holds the turn lock until its run ends, and a dropped connection lets the run finish (TD25). Replies are read back from the checkpoint after the run, so the stream and a reload show the same validated transcript. E2E runs without a key on a scripted provider that plays the loan agent by rule; it only starts with `DEMO_MODE=true` (TD25). Each E2E customer signs in from its own `X-Forwarded-For` address, or the suite trips the per-IP sign-in limit. Only the loan starter is shown until T17/T18 add theirs.

### Checkpoint D: J1 works end to end. Review with the user.
- [x] All green (lint, typecheck, unit/module/graph tests, 14 E2E specs); J1 runs end to end in the browser.
  *Checkpoint D findings, for the user's review* (no action needed to continue; each is fixed and tested):
  1. **Tool errors leaked to the model** (T14b). Under middleware, LangChain reports a tool's bad arguments as a `ToolInvocationError` whose message carries the schema parser's text and the refused arguments. The situation-label middleware now catches it, so the model only ever sees `INVALID_INPUT` (TD18, P1-09).
  2. **The decision-claim check was too loose** (T14c). Once any decision existed, all decision wording passed, so "you're approved" could follow a "not eligible". Claims are now held to the decision actually in state (P0-18).
  3. **LangChain retries six times by default** (T13). Left on, a model outage would mean six silent retries per call on top of ours. The OpenRouter adapter sets `maxRetries: 0`; retries belong to the agent's middleware (2, with backoff and jitter; FR-AGT-12).

- [x] **T16 · Onboarding module** (S). KYC field and NIC validation, enumeration-safe response, encrypted draft → confirm → unverified pending application (FR-ONB-01/02, BR-ONB-01/02).
  *Accept:* P0-14; NIC tables for both formats. *Verify:* `pnpm test`. *Deps:* T2, T3.
  *Result:* 45 onboarding tests on real SQLite. Mutants (all reverted): gave a matching NIC its own answer → `P0-14: the answer is identical …` failed; dropped the "already pending" check on confirm → the FR-ONB-02 replay test failed. The form is one encrypted column; the graph will only see the draft ID. Auth answers "is this NIC a customer's?" (it owns the table) by decrypting and comparing, which needs no new column at ~500 customers; onboarding gets it as an injected function, keeping its only dependency platform (ARCHITECTURE §6). Wired into the composition root with its route in T17.

- [x] **T17 · KYC journey** (M). KYC agent, `start_account_opening`, form card posting to the server, draft reference resume, confirm (FR-AGT-03, BR-ONB-03).
  *Accept:* P0-19 for form data; J2 E2E. *Verify:* `pnpm test && pnpm test:e2e`; manual mutant: resume with the raw form instead of the draft ID → P0-19 fails. *Deps:* T15, T16.
  *Result:* 16 E2E specs green (J2: fix-and-resubmit, review, send; and leaving the form). Mutants (all reverted): the harness resumed with the raw form beside the draft ID → the P0-19 route test and both FR-ONB-02 card tests failed; the form reference accepted any object → `P0-19: resuming with the raw form instead of a draft ID is refused` failed. The confirmation card's summary is read from the encrypted draft for that response only, so form values never enter state or checkpoints (both checked over every table). The journey is a state field set by starter buttons, so T18 adds triage for messages without one. The loan and KYC agents now share one specialist wrapper and handoff helper.

- [x] **T18 · Triage, callbacks and hand-back** (M). Triage with structured output, sticky routing, starter-button bypass, callback request and form, topic change / misroute hand-back (FR-AGT-01, 14, 15).
  *Accept:* a starter button costs no triage call; J3 E2E. *Verify:* `pnpm test && pnpm test:e2e`. *Deps:* T17.
  *Result:* 727 tests and 19 E2E specs green. `FR-AGT-01: a starter button costs no triage call` counts the triage model's requests. Mutant: removed the "don't send it straight back" guard → `P2-01: a misrouted message isn't sent straight back …` failed; reverted. Finding, fixed first (Prove-It): an ending relabelled the latest tool result in the whole history, so a callback in a later turn would have turned an earlier "SUBMITTED" into "HANDED_TO_PERSON"; only this turn's result is relabelled now. Triage is one structured-output call retried with `withRetry`, not counted in FR-AGT-11's conversation limits (TD26). The scripted model answers "other" as triage, so browser tests choose journeys with the starters.

- [x] **T19 · Settings page and demo controls** (M). Model pickers with price and context, key status, threshold display, reset the government limit, clear the cache, failure mode; all gated by `DEMO_MODE` (FR-SET-04/05, BR-SET-01).
  *Accept:* P0-15; J4 E2E; each failure mode demonstrable from the UI. *Verify:* `pnpm test:e2e`. *Deps:* T7b, T10, T13, T18.
  *Result:* 22 E2E specs green, including J4 (change a model, reset the limit), every failure mode set from the page and checked against the mock's answer, and P0-15 on a second server with demo mode off (the production build: Next.js 16 locks its dev directory, so two dev servers can't share it). P0-15 is also proven at route level. Manual mutant (opening the demo gate) not run: the session's permission check blocks temporarily weakening a security control, so it's left for the user. Folded in, per the user (B20, TD27): `.env.example` lists only the five operator settings; the government API is always the built-in mock on this server, and the rule-played model sits behind a test-only `E2E_SCRIPTED_MODEL=1`.

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

