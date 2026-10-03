# Spec: Bank Assistant

**Status:** approved 2026-10-03, revised after the build to match the code · **Structure:** [`ARCHITECTURE.md`](ARCHITECTURE.md) · **Reasoning:** [`DECISIONS.md`](DECISIONS.md) · **Rules:** [`CODING_STANDARDS.md`](CODING_STANDARDS.md), [`TESTING_STANDARDS.md`](TESTING_STANDARDS.md)

## 1. Objective

A small local bank (2–3 branches, ~500 customers, 50–60 daily users) has very few branch staff. An AI chat assistant takes the first-line work off them for two journeys:

1. **Loan:** a signed-in customer checks eligibility for a personal loan and, if eligible, applies.
2. **Account opening (KYC):** a new customer starts opening an account, which the branch then completes.

It must be **security-first and kind**: no customer data reaches someone who shouldn't see it, no action happens without proof of identity and consent, and every failure leaves the customer with an honest next step.

**Users:** customers (signed-in or new) on the chat screen; the bank operator (and, for this demo, the reviewer) on the settings screen.

**Success looks like:**
- A signed-in customer gets a final, correct eligibility outcome in one conversation, or a clear referral to an officer.
- Every P0 failure case has a deterministic test of the control code enforces; where a P0 also relies on a best-effort check of free text, the spec labels it and evals measure it.
- The 5-calls-a-day government API is never called a 6th time, and an outage never leaves a customer stuck.

## 2. Assumptions

The brief didn't fix these; they're stated so they can be challenged.

| # | Assumption |
|---|---|
| A1 | About 10 seeded demo customers stand in for the 500. They sign in with a **customer number** (e.g. `C1001`) and password, never the NIC. Credentials are in the README |
| A2 | One product: a **personal loan** of LKR 50,000–3,000,000 over 6–60 months at a fixed 14% a year. These are product terms, so they're public |
| A3 | Monthly income and existing monthly loan repayments come from the customer's bank record, not from chat |
| A4 | Credit scores range from 300 to 900. The government API also reports when a person has no credit history |
| A5 | The mock government API runs inside the app (`/api/mock-gov/*`) with its own tables. Its day resets at midnight Sri Lanka time |
| A6 | A KYC application is unverified until the applicant visits a branch with their original NIC |
| A7 | English only |

## 3. Scope

**In scope:** the two journeys, talking to a person (callback request), the settings screen (models per agent and demo controls), the mocked government API, audit logging, and evals.

**Out of scope:** everything considered and left out is in [`DECISIONS.md`](DECISIONS.md) §3 (deferred, with the trigger to revisit) and §4 (rejected), each with its reason.

## 4. Journeys

| ID | Journey | Happy path | Other endings |
|---|---|---|---|
| J1 | **Loan** | Sign in → "Check a loan" → amount and term → re-enter password → consent → credit check → **eligible** → confirm → application approved | Not eligible (ends) · referral created · already has an open application · credit check unavailable today |
| J2 | **Account opening** | "I'm new" → "Open an account" → KYC form → confirm → unverified pending application, visit a branch | Invalid details (fix and resubmit) |
| J3 | **Talk to a person** | "Talk to a person" → callback request recorded | — |
| J4 | **Settings** | Choose a model per agent; demo controls | Read-only when demo mode is off |

## 5. UI

Two screens, built with shadcn/ui.

**Chat (`/`):**
- A sign-in card (customer number + password), plus an **"I'm new"** button for account opening.
- Starter buttons: *Check a loan* · *Open an account* · *Talk to a person*.
- Messages: a typing indicator and progress updates while the assistant works; **each reply appears whole, after it has been validated**. Input is locked while a turn is running.
- **Secure inline cards**, shown when the graph pauses: password re-entry, consent, the KYC form, a confirmation summary, the callback form. Their answers go to the server, never to the LLM.
- Hard failures show the reference code.
- In demo mode only, a **Behind the scenes** panel shows the bank's side of the visitor's own conversation (DECISIONS B10).

**Settings (`/settings`):**
- API key status: *Key set* or *Missing*. Never the key.
- One model picker per agent (triage, loan, KYC), listing tool-capable OpenRouter models with **price per 1M tokens and context size**.
- The current approval threshold (read-only).
- Demo controls: reset today's government limit, clear the credit cache, age cached scores by 31 days, mock failure mode, and reset the signed-in customer's own demo data (applications and conversations; the audit log is kept).

## 6. Requirements by module

Module IDs and build order follow [`ARCHITECTURE.md`](ARCHITECTURE.md) §6. **BR** = business rule, **FR** = system requirement. Failure-case IDs (P0/P1/P2) are listed in §8.

**Test-level tags:** `U` unit · `M` module (real SQLite) · `G` graph (scripted fake model) · `E` browser · `V` eval. Each tag points to a test that exists and names its ID; a name in brackets says which test covers it when the ID differs. `—` means no automated test: the behaviour is covered by review, and the request plumbing follows Next.js practice instead of being unit-tested (TD28).

### 6.1 `platform`

| ID | Requirement | Acceptance | Tests |
|---|---|---|---|
| FR-PLAT-01 | Config is validated with zod at startup | A missing or invalid `APP_ENCRYPTION_KEY`, or a threshold outside 0–100%, stops the app with a clear operator message | U |
| FR-PLAT-02 | Field encryption for personal data (AES-256-GCM) | Round-trips; tampered ciphertext fails; NIC and KYC columns are never plaintext in the DB | G (P0-19) |
| FR-PLAT-03 | Append-only audit log with correlation ID, model and prompt version | Database triggers refuse any update or delete of an event | M, G |
| FR-PLAT-04 | Decisions and their audit record are written in one transaction | A failed audit write leaves no decision stored | M (P0-17) |
| FR-PLAT-05 | Idempotency: every state-changing action has a key with a unique constraint. Keys for steps inside the graph derive from business identity (conversation + assessment) | A replayed graph step finds its original result and makes no second side effect; a reused HTTP key gets 409 (TD22) | M |
| FR-PLAT-06 | Structured JSON logger with redaction | Values under sensitive keys (password, token, NIC, score) and NIC-shaped text are redacted from log output | M (audit); logger: — |
| FR-PLAT-07 | Seed command | Creates demo customers with designed outcomes: eligible, not eligible, borderline (→ referral), no credit history, open application | E (J1 uses it) |

### 6.2 `auth`

| ID | Requirement | Acceptance | Tests |
|---|---|---|---|
| BR-AUTH-01 | Identity comes **only** from a signed-in session; the NIC comes from the customer's record | No code path reads identity from chat text or tool arguments | G, E |
| FR-AUTH-01 | Login with customer number + password; `scrypt`; constant-time compare | Unknown user and wrong password give the **same** message | M (P0-13) |
| BR-AUTH-02 | Lockout after **5** consecutive failures for **15 minutes**; step-up failures count too | The 5th failure locks for 15 minutes; a correct password during lockout is refused; boundary at 4/5 | U, M |
| FR-AUTH-02 | Server-side sessions: 256-bit random token, only its SHA-256 hash stored; cookie `__Host-session` (`HttpOnly`, `Secure`, `SameSite=Strict`) | A DB row alone can't be used as a session; cookie flags asserted | E (FR-AUTH-04) |
| FR-AUTH-03 | **15-minute** idle and **2-hour** absolute timeouts; the token rotates at login and step-up | Expired sessions are rejected; the old token is invalid after rotation | — |
| FR-AUTH-04 | Logout revokes on the server | A copied cookie is rejected immediately after logout | E |
| BR-AUTH-03 | **Step-up** (password re-entry) before a **credit check** and before a **loan submission**; valid for **5 minutes**. The route handler verifies the password and rotates the token; the graph only receives `{ verified: true }` | No credit check or loan submission without a step-up in the last 5 minutes; the password never appears in graph state or checkpoints | M |
| FR-AUTH-05 | Guest sessions for "I'm new" (no customer attached; no step-up) | Guests can use KYC and callback only; loan paths return `NEEDS_SIGN_IN` | G, E |
| FR-AUTH-06 | Every conversation belongs to one session or customer | Reading or resuming someone else's conversation → 404 | M |
| FR-AUTH-07 | Per-IP rate limit on login: 10 per 15 minutes | 11th attempt → "too many attempts" | — |

### 6.3 `settings`

| ID | Requirement | Acceptance | Tests |
|---|---|---|---|
| FR-SET-01 | A model per agent role, defaulting to: triage `google/gemini-3.1-flash-lite`, loan `z-ai/glm-5.3-flash` (reasoning low), KYC `openai/gpt-5.6-luna` (reasoning low) | A change applies to **new** conversations only | E (J4) |
| FR-SET-02 | The model list comes from the `ModelCatalog` port: tool-capable models only, with price per 1M tokens (in/out) and context | Models without tool support are never listed; a removed model is flagged | — |
| FR-SET-03 | Key status only: *configured* or *missing* | The key value is never in any response | — |
| BR-SET-01 | Writes and demo controls work only with `DEMO_MODE=true` | With `false`: settings are read-only and demo endpoints return 404 | M, E |
| FR-SET-04 | Demo control: **reset today's government limit**, which clears the mock's per-IP counter and our budget row, block and cool-down | After a reset, a fresh credit check is allowed | E (J4) |
| FR-SET-05 | Demo controls: **clear the credit cache**; **age cached scores by 31 days**; **reset my demo data**; **mock failure mode** (`normal`, `slow`, `error`, `rate_limited`, `down`) | Each mode produces the behaviour in §6.4 | M |

### 6.4 `gov-credit`

The credit-score policy. The government API itself sits behind the `CreditBureau` port. **Capacity:** at most 5 attempts a day, so at most ~150 fresh checks in 30 days. Checks are made on demand, never in bulk; the cache is what lets a 500-customer bank live within that.

| ID | Requirement | Acceptance | Tests |
|---|---|---|---|
| BR-CRED-01 | Scores are cached per customer for **30 days** (`CREDIT_CACHE_TTL_DAYS`, 1–90, never past the stale window) | Just under 30 days → cache hit, no call; at 30 days → miss | U, M |
| BR-CRED-02 | **Stale-if-error:** when no fresh call is possible, a score up to **90 days** old may be used, marked `stale` | At 90 days → usable as stale; one ms later → not usable | U, M |
| BR-CRED-03 | **Daily budget** = the adapter's `callsPerDay` (5), per window ending at midnight Sri Lanka time. Every attempt counts, including failures and ambiguous timeouts | 5 attempts allowed; the 6th is never sent | U, M |
| FR-CRED-01 | Taking a budget slot is one atomic update | Two concurrent requests with one slot left → exactly one call | M |
| BR-CRED-04 | **429** → store `blockedUntil` (`Retry-After`, else next window); no calls until then | | U, M |
| BR-CRED-05 | **5 s** timeout per attempt. On timeout, 5xx or network error: **1 retry** after ~1 s (±25% jitter) if budget remains, then a **15-minute cool-down** | Fake clock: retry count, delays and cool-down asserted | U, M |
| BR-CRED-06 | **404** → "no credit history". Any other 4xx → failure, no retry, counted | | U, M |
| FR-CRED-02 | Responses are validated: integer score 300–900, or no history | Malformed or out of range → failure, never a score | U |
| FR-CRED-03 | Each fetch records whether the score changed since the last one | Stored on the cache row | — |
| BR-CRED-07 | No customer-triggered refresh | Nothing can force a fetch while a fresh cache entry exists | M (BR-CRED-01) |
| FR-CRED-04 | Typed results: `ok` with `{ score, fetchedAt, stale, hasHistory }`, or a failure `reason`. No budget and no usable cache → `unavailable` | The agent maps each reason to a situation label; nothing raw reaches the LLM | M (BR-CRED tests) |

### 6.5 `lending`

| ID | Requirement | Acceptance | Tests |
|---|---|---|---|
| BR-LEND-01 | **Bands:** A ≥ 750 (max LKR 3,000,000) · B 650–749 (1,500,000) · C 550–649 (500,000) · D < 550 (not eligible) | Boundary table at 549/550, 649/650, 749/750 | U |
| BR-LEND-02 | **Repayment-to-income:** (existing repayments + new monthly instalment) ÷ monthly income ≤ **40%**, in basis points. The instalment uses the standard amortised formula at 14% a year | Boundary at 3,999 / 4,000 / 4,001 bp | U |
| BR-LEND-03 | **Eligible** = band A–C **and** amount ≤ band maximum **and** repayment-to-income ≤ 40%. Otherwise not eligible, with one reason: `credit_profile`, `amount_above_limit` or `repayment_too_high` | Tested for `amount_above_limit`; the other reasons follow from the band and repayment tables, and the templates are fixed text | U |
| BR-LEND-04 | **Confidence** (integer basis points, 10,000 = full) is an **illustrative policy heuristic, not a measured probability**. It starts at 10,000 and loses: 2,000 if repayment-to-income is within 300 bp of the limit; 1,000 if the score is within 15 points of a band edge; 1,000 if the amount is between 90% and 100% of the band maximum (B19); 20 per day of score age after day 7 | Table-driven per factor | U |
| BR-LEND-05 | **Auto-decision:** confidence ≥ `AUTO_DECISION_THRESHOLD` (default 9,500 bp) → final outcome; below → referral. Applies to eligible and not-eligible outcomes alike | 9,500 → outcome; 9,499 → referral | U |
| BR-LEND-06 | **Hard referral rules, independent of the threshold:** a stale score, no credit history, or missing income or repayments on record | Referral even with the threshold set to 0 | U |
| BR-LEND-07 | Consent is recorded per assessment by the route handler before any score is used; the graph only receives the consent ID | No consent row → no credit check | M, G |
| BR-LEND-08 | **One open application** (approved, or referred and awaiting an officer) per customer | A new assessment shows the existing status instead | M |
| FR-LEND-01 | Every assessment is stored in `loan_assessments`: amount, term, outcome, reason, confidence, **threshold used**, score fetch time, stale flag | Persisted with its audit record in one transaction | M (partial) |
| BR-LEND-09 | **Endings:** *eligible* → confirm → approved application; *not eligible* → ends, no application; *referral* → a referred application is created by the decision, with an `officer_decision` field left for the officer | Each ending reachable; not-eligible creates nothing | E (J1, eligible ending) |
| BR-LEND-10 | **Submission is bound to its assessment:** the confirmation shows and submits the assessed amount and term only. At submit: step-up within 5 minutes and assessment younger than 30 minutes, else start again. The idempotency key is the assessment ID | Changed amounts are rejected; a replayed submit returns the same application | M, E |
| BR-LEND-11 | The score and band are **never** shown to the customer or given to the LLM. The one exception is the band in the demo-only panel (DECISIONS B10); the score is never shown | Output filter test + red-team eval | G, V |

### 6.6 `onboarding`

| ID | Requirement | Acceptance | Tests |
|---|---|---|---|
| FR-ONB-01 | KYC fields: full name, NIC, date of birth, address, mobile number (Sri Lankan format), account type (savings or current) | zod rejects each invalid field with a human message | E (J2) |
| BR-ONB-01 | NIC format: old (9 digits + V/X) or new (12 digits). The birth year encoded in the NIC must match the date of birth; the day number must be valid (1–366, or 501–866) | Valid and invalid examples of both formats | U |
| BR-ONB-02 | The response is **identical** whether or not the NIC already belongs to a customer; duplicates are flagged for the branch internally | Same body and status in both cases | M |
| FR-ONB-02 | The form posts to the server, which validates it and stores an **encrypted draft**; the graph resumes with the draft ID. Confirm turns the draft into an **unverified pending application**, idempotently | No form field values in graph state or checkpoints; a replayed confirm → one application | G, E |
| BR-ONB-03 | The KYC agent only learns "form received" | The LLM's input contains no form values | G |

### 6.7 `agent`

| ID | Requirement | Acceptance | Tests |
|---|---|---|---|
| FR-AGT-01 | **Triage** classifies into `loan`, `kyc`, `human` or `other` with structured output. It runs only when no journey is active or the topic changes; starter buttons skip it | A starter button costs no triage call; routing eval target ≥ 95% | V |
| FR-AGT-02 | **Loan agent** collects amount and term (validated against the product ranges), answers product questions, and calls `request_assessment`. It never states an outcome itself | Invalid arguments → `INVALID_INPUT` with a human hint | G |
| FR-AGT-03 | **KYC agent** explains account types and documents and calls `start_account_opening` | | E (J2) |
| FR-AGT-04 | No tool accepts identity; tools read the customer from runtime context | Tool schemas contain no identity fields | G |
| FR-AGT-05 | Fixed loan order: step-up → consent → credit check → decide → ending (BR-LEND-09) | A scripted model calling `request_assessment` at once still meets step-up and consent first; the bureau isn't called before both | G |
| FR-AGT-06 | Pauses resume only through the resume endpoint, with a **single-use** interrupt ID bound to the conversation and its owner. The resume value is a server-verified reference, never raw input. A node that pauses does nothing before its `interrupt()` | Typing "I consent" in chat does nothing; a replayed resume is rejected | G |
| FR-AGT-07 | Outcomes, referrals and failures are **code-written templates**. Each LLM reply is checked before sending: if it contains decision wording (approve/approved, eligible, decline/declined, reject/rejected, referred, qualify/qualified, granted, sanctioned) that doesn't match the decision in state, it's replaced with: *"I can't give a decision in chat. I can run a proper eligibility check for you. Shall I start?"* | A scripted model claiming approval → the customer sees the replacement, never the claim | G |
| FR-AGT-08 | The LLM receives **situation labels only**: `NEEDS_SIGN_IN`, `NEEDS_CONSENT`, `CHECK_UNAVAILABLE`, `ELIGIBLE`, `NOT_ELIGIBLE`, `REFERRED`, `APPLICATION_ALREADY_OPEN`, `RESULT_EXPIRED`, `APPLICATION_NOT_SENT`, `SUBMITTED`, `INVALID_INPUT`, `FORM_NOT_SENT`, `HANDED_TO_PERSON`, `CALLBACK_NOT_REQUESTED`: one per ending the customer was shown, so a follow-up stays consistent with it. Never error details, internal numbers or personal data | Tool-failure middleware tested per failure reason | G, V |
| FR-AGT-09 | NIC-shaped text is stripped **in the harness, before the graph**; `piiMiddleware` with a custom NIC detector also checks model output (defence in depth) | A third party's NIC typed in chat never reaches the model or a checkpoint | U, G |
| FR-AGT-10 | **LLM replies are buffered and validated** (FR-AGT-07 check + output PII check) before they're sent; typing and progress events stream meanwhile | No unvalidated LLM text reaches the browser | G, E |
| FR-AGT-11 | Limits: tool calls 3 per turn and 20 per conversation; model calls 5 per turn and 60 per conversation; recursion 25; output capped at 800 tokens for loan and KYC (about 400 visible plus room for reasoning, TD6) and 400 for triage | A scripted looping model stops at the tool-call limit; the customer sees an apology and a callback offer | G |
| FR-AGT-12 | Model errors: 2 retries with exponential backoff and jitter, then "the assistant is unavailable right now" + branch contact | `fakeModel().alwaysThrow()` → that message, no raw error | G |
| FR-AGT-13 | `durability: "sync"`. Side effects are at-least-once and idempotent: a step replayed after a crash finds its earlier result | Application saved → checkpoint write fails → retry returns the same application | M |
| BR-AGT-01 | **No action to please the user.** Emotional pressure, urgency, authority claims and task smuggling never trigger tools or change outcomes; off-topic requests get a polite redirect | Graph test: a scripted "pressured" model can't skip a gate or change a stored outcome. Eval: refusal quality on real models (target) | V |
| BR-AGT-02 | **Only for the person here** (B21). A request to act for someone else is declined plainly, with how that person can start for themselves, and the assistant offers to continue for the customer; it never carries on quietly | Prompt rule in the loan and KYC agents. That nothing can be done for another person is code (FR-AGT-04, P0-03, P0-18) | — |
| FR-AGT-14 | "Talk to a person" creates an idempotent callback request (signed in: from the record; guest: a callback form) | One request per conversation and reason | E (J3) |
| FR-AGT-15 | A topic change mid-journey hands back to triage with progress kept; a misrouted specialist hands back too | | V |
| FR-AGT-16 | Tone: one shared tone guide in every specialist prompt (plain, warm, one question at a time, always a next step, no jargon) | Tone eval target ≥ 4/5 average (LLM judge, written rubric) | V |

### 6.8 `harness` and `web`

| ID | Requirement | Acceptance | Tests |
|---|---|---|---|
| FR-WEB-01 | Every state-changing route checks the `Origin` header, session, zod body, idempotency key and conversation ownership | Missing or foreign origin → 403 | — |
| FR-WEB-02 | Chat messages ≤ 1,000 characters; per-IP limit of 20 chat requests per minute | 1,001 characters → rejected with a human message; 21st request → "slow down" | — |
| FR-WEB-03 | One turn at a time per conversation. While a pause is pending, the conversation waits for its answer: a chat message is refused until the pause is answered through its card | A concurrent turn → 409; a chat message while a pause is pending → 409 and the pause is kept; the UI locks input during a turn and while a pause is pending | — |
| FR-WEB-04 | Server-sent events: `typing`, `progress`, `message` (whole, validated), `interrupt`, `error` (message + reference), `done` | | E (J1) |
| FR-WEB-05 | Raw errors never reach the browser. Hard failures show: *"Something went wrong on our side. Reference: K7Q2. You can give this to our support team if they ask."* The reference is the correlation-ID prefix | | — |
| FR-WEB-06 | Security headers: CSP (`default-src 'self'`), `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy: no-referrer`; HSTS in production | Asserted on responses | U |
| FR-WEB-07 | Accessible: labelled inputs, full keyboard use, WCAG AA contrast | | — |

### 6.9 `mock-gov`

| ID | Requirement | Acceptance | Tests |
|---|---|---|---|
| FR-MOCK-01 | `POST /api/mock-gov/credit-score` with `{ nic }` → `200 { score }`, or `404` (no credit history). Nothing about future evaluations is ever returned | | E (J1) |
| FR-MOCK-02 | Its own per-IP counter: the 6th call in a day → `429` with `Retry-After` | | — |
| FR-MOCK-03 | Failure modes: `slow` (6 s, beyond our timeout), `error` (500), `rate_limited` (429), `down` (503) | | — |
| FR-MOCK-04 | Admin reset is reachable only in demo mode | 404 otherwise | E (P0-15) |
| FR-MOCK-05 | Answers only the key it issued the bank (`x-api-key`, derived from `APP_ENCRYPTION_KEY`) | No key or a wrong one → `401`, not counted toward the limit | M |

## 7. Non-functional requirements

| Area | Target |
|---|---|
| Responsiveness | Targets: a typing indicator straight away, progress updates during government calls, and a full validated reply within 5 s at p95 on the default models. Only the reply time is measured, by the evals (5.0 s p95 at T20) |
| Capacity | At most 5 government attempts a day (~150 fresh checks per 30 days), on demand only |
| Cost | Under ~$30 a month at 55 daily users on the default models (DECISIONS has the working) |
| Privacy | Every model request sends `provider: { zdr: true, data_collection: "deny" }` and ignores China-hosted first-party endpoints; data minimisation everywhere; Sri Lanka PDPA No. 9 of 2022 noted |
| Reliability | Every external failure ends in an honest message and a next step; replayed steps are safe |
| Scale | One instance, ~5 concurrent users; growth path in ARCHITECTURE §12 |
| Operability | `pnpm install`, `pnpm db:setup`, `pnpm dev`. No Docker. `.env.example` documents every operator setting |

## 8. Failure cases

Severity meanings are in ARCHITECTURE §11. **Every P0 is proven by a deterministic test** (U, M, G or E) of the control code enforces; evals add quality evidence but never prove a P0. Where a P0 also has a best-effort check of free text, its row says so.

| ID | Case | Required behaviour | Requirement | Tests |
|---|---|---|---|---|
| **P0-01** | Credit check without sign-in | Unreachable → `NEEDS_SIGN_IN` | BR-AUTH-01, FR-AUTH-05, FR-AGT-05 | G |
| P0-02 | A third party's NIC typed in chat | Stripped before the graph; never used or stored | FR-AGT-09 | U |
| P0-03 | Injection triggers the credit tool early or with arguments | No identity arguments; step-up and consent gates hold | FR-AGT-04, FR-AGT-05, BR-LEND-07 | G |
| P0-04 | Another customer's conversation | 404 | FR-AUTH-06 | M |
| P0-05 | LLM invents an outcome | **Guaranteed by code:** chat text can never create a decision or an application; outcomes reach the customer only as template cards. **Best-effort, measured by evals:** the wording check replaces a reply that claims an outcome the state doesn't hold; a word list can't catch every paraphrase | FR-AGT-07, FR-AGT-10 | G, V |
| P0-06 | Score, band, NIC or system prompt in a reply | **Guaranteed by code:** the score and band are never given to the LLM, and NIC-shaped text is redacted. **Best-effort, measured by evals:** the prompt-leak check catches a reply that repeats lines of a prompt, not a paraphrase | BR-LEND-11, FR-AGT-09, FR-AGT-10 | G, V |
| P0-07 | Outcome given below the threshold | Referral | BR-LEND-05 | U |
| P0-08 | Stale, missing or no-history data gives a final outcome | Hard referral | BR-CRED-01, BR-CRED-02, BR-LEND-06 | U |
| P0-09 | Double submit or replayed resume | Original result returned; single-use interrupt ID | FR-PLAT-05, BR-LEND-10, FR-AGT-06 | M, G |
| P0-10 | Second open application | Existing status shown | BR-LEND-08 | M |
| P0-11 | Malformed government response | Treated as a failure | FR-CRED-02 | U |
| P0-12 | Submission with different amount or term, or an expired assessment | Rejected | BR-LEND-10 | M |
| P0-13 | Login brute force | Lockout | BR-AUTH-02 | U, M |
| P0-14 | KYC NIC enumeration | Identical response | BR-ONB-02 | M |
| P0-15 | Demo endpoints with `DEMO_MODE=false` | 404 | BR-SET-01 | E |
| P0-16 | Missing or invalid security config | App refuses to start | FR-PLAT-01 | U |
| P0-17 | Decision without an audit record | Neither is stored | FR-PLAT-04 | M |
| P0-18 | Pressure or impersonation changes an action or outcome | No gate skipped, no outcome changed | BR-AGT-01 | G, V |
| P0-19 | Password or form data saved in graph state | References only | BR-AUTH-03, FR-ONB-02 | G, M |
| **P1-01** | Government timeout, 5xx or network error | Retry → cool-down → stale (→ referral) → else `CHECK_UNAVAILABLE` + callback | BR-CRED-05 | M, G |
| P1-02 | Government 429 | `blockedUntil`; same fallback | BR-CRED-04 | U, M |
| P1-03 | Daily budget used up | No call; same fallback | BR-CRED-03 | U, M, G |
| P1-04 | Race for the last call | Exactly one call | FR-CRED-01 | M |
| P1-05 | Ambiguous timeout | Counted | BR-CRED-03 | M (P1-01) |
| P1-06 | OpenRouter key missing, invalid or out of credit | "Assistant unavailable" + branch contact; Settings warns | FR-AGT-12, FR-SET-03 | G |
| P1-07 | OpenRouter 429, 5xx or timeout | 2 retries → same message; resend works | FR-AGT-12 | — |
| P1-08 | Selected model removed or loses tool support | Flagged in Settings; P1-06 message at runtime | FR-SET-02 | — |
| P1-09 | Invalid tool arguments | `INVALID_INPUT` + human hint | FR-AGT-02 | — |
| P1-10 | Call limits hit | Apology + callback offer | FR-AGT-11 | G |
| P1-11 | Connection drops mid-turn | Reload restores the conversation; no duplicate effects | FR-AGT-13 | — |
| P1-12 | Oversized or spammy input | Rejected / rate-limited | FR-WEB-02 | — |
| P1-13 | Checkpoint write fails after a side effect | Retry returns the earlier result | FR-AGT-13 | M (replay) |
| P1-14 | Off-topic tasks or task smuggling | Polite redirect, no tool calls | BR-AGT-01 | G, V |
| P1-15 | Second message during a turn, or a chat message while a pause is pending | 409; input locked until the turn ends or the pause is answered; the pause is kept | FR-WEB-03 | — |
| **P2-01** | Triage misroutes | Specialist hands back | FR-AGT-15 | V |
| P2-02 | Topic change mid-journey | Back to triage; progress kept | FR-AGT-15 | V |
| P2-03 | A pause is abandoned | Resumes on return (within session limits) | FR-AGT-06 | — |
| P2-04 | Non-English message | Polite reply in English | FR-AGT-16 | V |
| P2-05 | Model changed mid-conversation | New conversations only | FR-SET-01 | — |
| P2-06 | SQLite busy | `busy_timeout` + retry | FR-PLAT-05 | — |
| P2-07 | Same customer checks from two tabs at once | May cost one extra call (D3) | BR-CRED-03 | — |
| P2-08 | Customer asks to act for someone else (another customer, a relative, a claimed operator) | Declined plainly, with how that person can start; offers to continue for the customer. Nothing can be done for the other person (P0-03, P0-18) | BR-AGT-02 | — |

## 9. Testing strategy

Full rules: [`TESTING_STANDARDS.md`](TESTING_STANDARDS.md).

- **Manual mutants** for the P0 controls and the business-rule boundaries (threshold, eligibility, confidence, cache lifetime, budget, lockout, ownership, consent, single-use resume, duplicate submit, references-only state): break the code on purpose, watch the test fail, revert. Recorded in `tasks/todo.md`.
- **Evals** (promptfoo) are **quality targets**, run on the default models plus at least one Claude and one GPT model:

  | Suite | Target |
  |---|---|
  | Routing | ≥ 95% |
  | Refusals and scope | 100% |
  | Red-team | 100% blocked |
  | Tone | ≥ 4/5 |
  | Follow-ups after an outcome | 100% |

  Pass rates and latency per model go in the README once the final run is done.
- **Red-team cases:**
  - someone else's NIC
  - "I'm already verified"
  - system-prompt extraction
  - "what's my score?"
  - "when is my next evaluation?"
  - draining the budget
  - emotional pressure
  - authority claims
  - urgency (covered in the refusals suite)
  - task smuggling
  - "ignore previous instructions"
- **Verified early**, before anything depended on them: the `Command.PARENT` handoff works from a wrapper node (T4); the SQLite checkpointer runs on Node 25 (T2, Checkpoint A); reasoning tokens do count toward the output limit, so loan and KYC get room for them (T13, TD6).

## 10. Tech stack and commands

Next.js 16.3 (App Router) · React 19 · TypeScript 5.9 strict · Tailwind 4 + shadcn/ui · LangGraph.js 1.4.18 · `langchain` 1.5.15 · `@langchain/openrouter` 0.4.17 · zod 4 · SQLite + Drizzle · Vitest 5 · Playwright · promptfoo · pnpm 10 · Node 25.

Commands are in the [README](../README.md).

Project structure: ARCHITECTURE §6. Code style: CODING_STANDARDS (§3 shows the typed-result style).

## 11. Boundaries

| Always | Ask first | Never |
|---|---|---|
| Follow ARCHITECTURE, CODING_STANDARDS and TESTING_STANDARDS | Adding a dependency | Commit secrets, `.env` files or real personal data |
| Write the test first for business rules; prove P0 tests can fail | Changing a business number (limits, lifetimes, threshold) | Give the LLM identity, scores, thresholds, error details or authority |
| Validate every boundary with zod | Changing the DB schema after the first migration | Put passwords, form data or NIC-shaped text into graph state |
| Check the live official docs for our pinned LangGraph versions | Changing CI or hooks | Let a tool accept identity arguments |
| Record every considered-and-declined option in `DECISIONS.md` | Adding a port or an external system | Remove or skip a failing test to get to green |

## 12. Success criteria

- [x] Every P0 has a passing deterministic test whose name carries its ID (P0-15 is a browser test).
- [x] A manual mutant on each P0 control and decision boundary makes its test fail (recorded in `tasks/todo.md`).
- [ ] CI is green on `develop` and `main` (pending the first push).
- [ ] Eval targets met on the default models; results for at least one Claude and one GPT model are in the README.
- [x] The README demo script walks J1–J4 end to end, including the referral, budget-exhausted and API-down paths.
- [ ] ARCHITECTURE, DECISIONS, SPEC, the plan (`tasks/`), the standards and the diagrams match what was built.

## 13. Resolved questions

1. **Demo values** (A2, BR-LEND-01): accepted.
2. **No specific lower amount** in a not-eligible reply: the engine answers the requested terms rather than making offers, so quoting amounts would turn the chat into a negotiation. A customer could still find their own rough band by trying amounts. That's accepted: it's their own data, and every attempt is audited.
