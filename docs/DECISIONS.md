# Decisions

**Why** the bank assistant is built the way it is. What it does is in [`SPEC.md`](SPEC.md); its structure is in [`ARCHITECTURE.md`](ARCHITECTURE.md).

Four parts: **business** decisions (the bank's calls), **technical** decisions (options → choice → trade-off), **deferred** items (right idea, wrong time) and **rejected** items (wrong idea).

## 1. Business decisions

| ID | Decision | Reason |
|---|---|---|
| B1 | Scope is two journeys: **loan** (eligibility → application) and **account opening** (KYC). Anything else gets a short answer or a callback | It's the first-line work the branch staff want taken off them, and a small scope is a small attack surface |
| B2 | A deterministic rules engine decides. The customer sees one of three endings: **eligible** (confirm → approved application), **not eligible** (ends), or **referred** to a loan officer | The AI is never the accountable party for a lending decision |
| B3 | The assistant never opens an account. It collects validated KYC details and creates an **unverified pending application**; the branch completes it when the applicant brings their original NIC | Identity proofing needs documents and a physical check |
| B4 | A credit check needs explicit, recorded consent for that assessment | Banking practice, and it leaves an audit record |
| B5 | Minimal disclosure: never reveal or guess the next score evaluation date, internal thresholds, or anything about other customers | Government credit data is strictly controlled |
| B6 | The 5-a-day government budget is shared by the whole bank. When it's gone, the assistant says so honestly and offers a next-day retry or a callback | 5 calls a day across 50–60 daily users is the binding constraint |
| B7 | Credit scores are cached for **30 days** | See [TD7](#td7-credit-score-cache-30-days) |
| B8 | Built for ~500 customers. No scaling work; the growth path is documented only | Time to market |
| B9 | The credit score and band are **never shown** to the customer, only the outcome and a plain-language reason | The bank may use bureau data for its decision, not republish it. A raw number invites disputes branch staff can't resolve, and the customer's real question is "can I get the loan?" Side effect: the LLM never sees the score, so it can't leak it |
| B10 | Audit logs are **not exposed in any UI**. Reviewers query them as the README shows | Audit data is for compliance and staff; a screen would widen access to personal data |
| B11 | English only | Sinhala and Tamil quality differs per model; it needs its own evaluation |
| B12 | "Talk to a person" creates a **callback request**. No live-agent console | A small team; it matches how the branch already works |
| B13 | **Auto-decision threshold: 95% confidence by default**, set by the bank in config (`AUTO_DECISION_THRESHOLD`). At or above it the outcome is final; below it an officer decides. Only a person changes it | The threshold is the bank's risk appetite: higher means fewer wrong instant answers, lower means more customers get one. That's a business call |
| B14 | **Step-up** (re-enter the password) before the credit check and before a loan submission, valid for 5 minutes. Guests submit KYC unverified, without step-up | Protects a hijacked or unattended session at the two moments that matter. KYC is verified at the branch anyway (B3) |
| B15 | **One open loan application** per customer. A new attempt shows the existing status | Stops duplicates reaching the officers |
| B16 | A not-eligible reply doesn't suggest a lower amount | The engine answers the requested terms; quoting amounts would turn the chat into a negotiation. A customer could still find their own rough band by trying amounts; that's their own data, and every attempt is audited |
| B17 | **No action to please the user.** Emotional pressure, urgency, authority claims and task smuggling never trigger tools or change outcomes; off-topic requests get a polite redirect | A kind tone must never become a lever |
| B18 | Demo product and rule values: one personal loan, LKR 50,000–3,000,000 over 6–60 months at 14% a year; bands A–D; repayment-to-income ≤ 40% (SPEC A2, BR-LEND-01…03) | Realistic for a small Sri Lankan bank and easy to demonstrate; all of them are config, not code |
| B19 | The confidence penalty for a large amount applies only **between 90% and 100% of the band maximum** (BR-LEND-04). An amount over the maximum loses nothing for its size, so a clean over-limit request is a final "not eligible" | The penalty marks borderline uncertainty; an over-limit amount isn't uncertain. As first written, every over-limit request fell below the threshold and went to an officer for an answer the rules already knew (found in T12) |
| B20 | The bank is hypothetical, so the government credit API is **always the built-in mock**. The operator sets five things only: the OpenRouter key, the encryption key, the auto-decision threshold, the cache lifetime and demo mode | There is no real service to point at, and a setting that changes nothing only confuses whoever deploys or reviews it |
| B21 | **Only for the person here.** A request to act for someone else (another customer, a relative, a claimed operator) is declined plainly, with how that person can start for themselves, and the assistant offers to continue for the customer instead. It never carries on quietly | Three options were weighed. Acting for the other person is impossible by design: identity comes only from the session (FR-AGT-04). Carrying on quietly for the signed-in customer is safe but misleading: they'd believe it was done for the other person and find out at the branch. Declining and offering the customer's own journey is honest and keeps them moving. Staff don't use the customer chat, so an operator claim gets no special path. This is prompt-level clarity only: the guarantee that nothing is done for another person is code (P0-03, P0-18), so it adds no test or eval |

## 2. Technical decisions

### TD1. Next.js instead of a plain HTML page

| Options | Choice | Trade-off |
|---|---|---|
| Plain HTML page + separate API · **Next.js (App Router)** | Next.js | A delivery-speed decision: it's the candidate's strongest stack and gives UI and API in one codebase. The interviewer suggested plain HTML and agreed to the change. Cost: a heavier framework than the UI strictly needs |

### TD2. Agent pattern: router

LangChain's docs list five multi-agent patterns. Three are real alternatives here; they differ in **who decides what happens next**.

| Criterion | Single agent | Supervisor (subagents) | **Router + specialists** |
|---|---|---|---|
| Who decides the next step | One LLM | A central LLM | Code + a cheap classifier |
| LLM calls per turn | 1 | 2–3 | 1 once a journey is active |
| Can the KYC chat reach the credit tool? | Yes | No | No |
| Where the verification gate lives | The prompt | A worker | A graph edge (code) |
| What each LLM sees | Everything | The supervisor sees everything | Only its own journey |
| Model per agent | No | Yes | Yes |

**Choice:** router with **sticky routing**. Triage runs only when no journey is active or the topic changes; starter buttons skip it. The safety-critical steps inside a journey are graph nodes, not LLM choices.

**Dropped:** *handoffs/swarm* (no single place to enforce the verification gate), *skills* (one agent can still reach every capability), *custom workflow* (not an alternative; we use it inside each specialist).

**Trade-off:** triage can misroute, so specialists hand back (FR-AGT-15) and routing is measured by evals. Upgrade path: a supervisor, if a future journey needs to combine specialists.

### TD3. No humanizer agent

| Options | Choice | Trade-off |
|---|---|---|
| A final LLM that rewrites every reply for tone · **a shared tone guide in every prompt + code-written templates for critical messages + tone evals** | Tone guide, templates, evals | A humanizer doubles model cost and latency on every turn, can rewrite facts ("referred" → "approved"), and sees every reply, which widens data exposure. Without it, tone depends on each specialist following the guide, so tone is scored by evals (FR-AGT-16) |

### TD4. Replies are buffered and validated, not token-streamed

| Options | Choice | Trade-off |
|---|---|---|
| Stream LLM tokens · release sentence by sentence after checking each · **buffer the whole reply, validate it, send it whole** | Buffer and validate | A streamed token can't be taken back, so an invented outcome or a leaked NIC would reach the screen before any check. Sentence-by-sentence release was declined as too complex for the gain. The cost is perceived speed, recovered with typing and progress events that do stream (FR-WEB-04) and short replies (400 visible tokens) |

### TD5. Streaming API

| Options | Choice | Trade-off |
|---|---|---|
| `streamEvents` v3 · **`stream()` with `updates` and `custom` modes** | `stream()` | The docs recommend `streamEvents` v3 for new apps, but our installed version marks it experimental. `stream()` is stable and enough, because we don't stream LLM tokens (TD4) |

### TD6. Models per role and cost

The bank brings its own OpenRouter key and can change any model in Settings. Defaults (OpenRouter list prices per 1M tokens, 2026-10-03; all tool-capable with zero-data-retention endpoints):

| Role | Default | In / out | Why |
|---|---|---|---|
| Triage | `google/gemini-3.1-flash-lite` | $0.25 / $1.50 | Classification only: cheap, fast, structured output |
| Loan | `z-ai/glm-5.3-flash`, reasoning `low` | $0.15 / $0.50 | The strongest published agentic score among cheap models. Every gate is in code, so the loan agent doesn't need an expensive model to be safe. Claude Haiku was considered and declined on cost (below). Runner-up: `deepseek/deepseek-v4.1-flash` with reasoning off |
| KYC | `openai/gpt-5.6-luna`, reasoning `low` | $0.20 / $1.20 | Cheap mid-tier with reliable tool calls |

**Cost working** (an upper bound: 55 daily users × 30 days, and every user is assumed to run a full loan conversation *and* a full KYC conversation):

| Role | Calls per user per day | Tokens per call (in / out) | Monthly tokens (in / out) | Monthly cost |
|---|---|---|---|---|
| Triage | 2 | 1,500 / 50 | 4.95M / 0.17M | $1.49 |
| Loan | 6 | 3,500 / 240 | 34.65M / 2.38M | $6.39 |
| KYC | 6 | 3,500 / 240 | 34.65M / 2.38M | $9.78 |
| Reasoning tokens (`low`), assumed to double loan and KYC output | | | +4.75M out | $4.04 |
| **Total** | | | | **≈ $22 a month** |

The same loan traffic on Claude Haiku ($1 / $5) would cost ≈ $47 a month on its own. Real token counts per turn are measured by the evals.

**Provider settings:** every request sends `provider: { zdr: true, data_collection: "deny" }` (only providers that keep no data) and ignores China-hosted first-party endpoints (`z-ai`, `siliconflow`) for the GLM model. Reasoning is set explicitly because GLM defaults to its maximum. **Reasoning tokens count toward the output limit** (measured in the T13 smoke check: GLM at `low` spent 197 of 400 on reasoning, GPT-5.6 Luna 46), so the loan and KYC requests allow 800 output tokens: the 400 visible tokens of FR-AGT-11 plus 400 for reasoning. Triage has no reasoning setting and keeps 400. OpenRouter publishes no latency or tool-error data, so our evals measure both on at least two models.

### TD7. Credit-score cache: 30 days

**The trade:** every cache miss uses one of only 5 calls a day for the whole bank; every hit risks a score that changed since we fetched it. So the right lifetime is **the shortest one that serves a customer's whole loan journey with one call**.

**Assumptions** (stated so they can be challenged):

| Assumption | Value |
|---|---|
| A loan journey is several visits: check, think and gather documents, come back to apply | Days to ~2 weeks |
| Demand: 1 in 10 of 50–60 daily users starts a loan conversation | 5–6 first-time checks a day: already the whole budget |
| Score re-evaluation cycle, at an unknown point | ~180 days |
| Chance a cached score has changed when read | ≈ age ÷ 180 days |

**Worked example:** a customer checks on day 0, asks a follow-up on day 3 and applies on day 14.

| Lifetime | Government calls | Worst-case chance the score is stale | Verdict |
|---|---|---|---|
| 12 h | 3 | 0.3% | Every return visit costs a call, for a score that's ~99% unchanged |
| 24 h | 3 | 0.6% | Same as 12 h: the extra freshness benefits nobody |
| 7 days | 2 | 3.9% | Still pays twice for one journey |
| **30 days** | **1** | **≤ 17%** | **The shortest lifetime that covers the journey with one call** |
| 90 days | 1 | ≤ 50% | Saves nothing over 30 days, but staleness triples |

**Choice:** 30 days, which is the optimum **under these assumptions**:
1. Below 30 days, freshness is paid for with calls taken from new customers. A first-time customer who can't be checked has no score at all, which is worse than a slightly old one.
2. Above 30 days, nothing is saved, and staleness keeps rising in a straight line.

**Capacity:** at most ~150 fresh checks per 30 days, on demand only; the cache is what lets 500 customers live within that.

**Trade-off and re-tuning:** if the real re-evaluation cycle or journey length differs, so does the optimum. Each fetch records whether the score changed (FR-CRED-03), so the lifetime can be re-tuned from data (D6). It's configurable (`CREDIT_CACHE_TTL_DAYS`). Supporting rules: keyed by internal customer ID (never the NIC); no customer-triggered refresh.

### TD8. Unreliable government API: budget, block and cool-down

| Options | Choice | Trade-off |
|---|---|---|
| Retry freely · full circuit breaker · **persisted daily budget + 429 block + one retry + 15-minute cool-down + stale-if-error** | Budget, block, cool-down | A 6th call is impossible because taking a slot is one atomic update, and every attempt counts, including ambiguous timeouts. A circuit breaker adds state and tuning for no gain: the budget already caps calls to a failing API (D2). Stale-if-error (≤ 90 days) keeps customers moving, but a stale score always leads to a referral (TD9) |

### TD9. Decision confidence

| Options | Choice | Trade-off |
|---|---|---|
| The LLM's self-reported confidence · an ML model on past decisions · **rules-engine margins + data quality** | Rules heuristic, in integer basis points | Deterministic, explainable and testable. It's an **illustrative policy heuristic, not a measured probability**, and the docs say so; it only becomes one once calibrated against officer decisions (D10). Hard referral rules (stale score, no history, missing income or repayments) apply regardless of the threshold, so poor data can never produce a final outcome. Every decision stores the threshold it used |

### TD10. Identity, sessions and step-up

| Topic | Options | Choice | Trade-off |
|---|---|---|---|
| Where identity comes from | Chat · tool arguments · **the signed-in session** | Session; the NIC comes from the customer's record | Tools take no identity arguments, so the LLM can't choose whose score is checked |
| Session type | Stateless JWT · **server-side sessions** | Server-side, hashed tokens | Logout revokes immediately, so a copied cookie dies. Costs a DB lookup per request, which is nothing at this scale |
| Session binding | **No binding** · IP or device binding | No binding | Binding breaks mobile users on changing networks; short timeouts, rotation and step-up cover a stolen cookie instead |
| Re-authentication | None · OTP/TOTP · **password re-entry** | Password step-up now | Protects hijacked or unattended sessions. Only a second factor stops a stolen password, so it's the production control (D1) |
| Password hashing | bcrypt or argon2 (native packages) · **Node's built-in `scrypt`** | `scrypt` | No native dependency; a memory-hard hash |
| A refused sign-in | Say "unknown customer", "wrong password" or "locked" · **one answer for all three** | One answer | Sign-in never confirms that a customer number exists or is locked, so guessing learns nothing. The message tells a real customer that sign-in pauses after 5 tries, and the audit trail keeps the real reason. An unknown number is checked against a dummy hash at full cost, so timing doesn't tell them apart either |
| Login rate-limit counts | Database table · **in memory** | In memory | One instance (ARCHITECTURE §12); a restart only gives a caller a fresh 15-minute window, and the per-account lockout, which is in the database, still holds. A shared store comes with a second instance |
| Who owns a conversation | The session that started it · **the customer, across sessions; a guest's, only its own session** | Customer, or the guest session | A signed-in customer gets their conversation back after a timeout or on another tab (P1-11). A guest has no identity beyond the session, so their conversation ends with it. Not yours and doesn't exist are one lookup and one 404 (P0-04) |
| BYOK key storage | Typed into a UI form and stored encrypted · **server environment only** | Env | No key ever crosses the network from a browser, and there's no key-storage code to get wrong. Changing the key means a restart. Production uses a secret manager |

### TD11. Pauses resume with references only

| Options | Choice | Trade-off |
|---|---|---|
| Resume the graph with the raw input (password, consent text, form) · **the route handler verifies or stores it and resumes with a reference** (`{ verified: true }`, a consent ID, a draft ID) | References | Saved state and checkpoints never hold secrets or form data, and the LLM never sees them. Each resume uses a **single-use interrupt ID** bound to the session and conversation, so a replay is rejected. Costs one dedicated resume route and a pending-interrupt record |

### TD12. Structure: modular monolith, ports and adapters

| Topic | Options | Choice | Trade-off |
|---|---|---|---|
| Deployment shape | Microservices · **modular monolith** | One Next.js app, modules with lint-enforced boundaries | Suits one small team and ~500 customers (D9) |
| External systems | Call SDKs from domain code · **ports and adapters** | Ports | Swapping the government endpoint or the model provider is a new adapter; cache, budget and rules code doesn't change. Costs a port type and a composition root |
| Database | Behind a repository port · **Drizzle directly** | Drizzle | Drizzle already isolates the SQL dialect, so Postgres is a dialect change. A repository layer would add files, not options |
| Engine | Postgres · **SQLite** | SQLite | Zero setup for the demo, same schema later (D5). One writer at a time, handled with `busy_timeout` and retry |
| Domain code and LangChain | Shared · **domain modules never import LangChain or LangGraph** | Separated | Business rules run and test with no model at all |
| Enforcing the layers | `no-restricted-imports` alone · **`import/no-restricted-paths` for layers and module privacy, `no-restricted-imports` for banned packages** | Both | `no-restricted-imports` only sees the import text, so a relative path like `../../agent` slips past it. `import/no-restricted-paths` resolves the real file and is already installed with `eslint-config-next` |

### TD13. Reliability inside the graph

| Options | Choice | Trade-off |
|---|---|---|
| Exactly-once side effects · **at-least-once, made safe by idempotency** | At-least-once + idempotency keys from business identity (conversation + assessment) | Exactly-once isn't achievable across a crash between a side effect and a checkpoint write. A replayed step finds its earlier result instead. Checkpoints use `durability: "sync"`, because the default `"async"` can lose the last step on a crash, at the cost of a little latency per step |

### TD14. One turn at a time per conversation

| Options | Choice | Trade-off |
|---|---|---|
| A message collector node that merges rapid messages · **one turn at a time** (the UI locks input; the server rejects a concurrent turn with 409) | One turn at a time | A collector adds a wait to every turn, so everything feels slower (D11). A customer who sends two quick messages has to wait for the reply to the first |

**A pending pause counts as an unfinished turn** (the user's call at Checkpoint A). The T4 spike showed that a chat message sent while an `interrupt()` is pending starts a new run from START and silently drops the pause (documented LangGraph behaviour). Options were: let the message through and drop the pause · resume the pause with the chat text · **refuse the message with 409 and keep input locked until the pause is answered through its card**. Dropping it loses the customer's place without telling them; resuming with chat text breaks the references-only rule (TD11). Cost: a customer who wants to move on has to answer the card first (declining is an answer)

### TD15. Audit log separate from checkpoints

| Options | Choice | Trade-off |
|---|---|---|
| Use LangGraph checkpoints as the record · **an append-only `audit_events` table** | Separate audit table | Checkpoints are internal and can be pruned; audit records must never change. A decision and its audit record are written in one transaction. Costs a second write path |

### TD16. Proving the tests

| Topic | Options | Choice | Trade-off |
|---|---|---|---|
| Mutation testing scope (superseded by TD28) | Everywhere · none · **decision modules only** | Stryker (≥ 80%) on the threshold, eligibility, confidence, cache lifetime, budget and lockout | There, a surviving mutant is a real business bug. Elsewhere it's slow and noisy, so P0 controls outside that scope get a **manual mutant** (break it on purpose, watch the test fail, revert) |
| What proves a P0 | Evals · **deterministic tests** | Deterministic tests | Evals on real models vary run to run, so they measure quality targets, never guarantees |
| Coverage gate | 80% lines and branches · **no gate** | No gate (the user's call at Checkpoint A) | Coverage rewards lines run, not behaviour proven, and a gate invites tests written to touch lines. Requirement-traced test names, a deterministic test per P0 and mutation testing on the decision modules show what's actually proven. Cost: an untested file no longer fails the build by itself, so review and the traceability search (an ID with no test) have to catch it |
| Database in tests | Mocked · **real in-memory SQLite** | Real | A mock would hide the bugs we care about most: a non-atomic budget update or a missing unique constraint |

### TD17. Money and ratios as integers

| Options | Choice | Trade-off |
|---|---|---|
| Floats · **integer LKR and integer basis points** | Integers | No rounding surprises at a rule boundary (`9_500` bp is exactly 95%). Costs a conversion at the display edge |

### TD18. LangGraph and LangChain features declined

| Feature | Why not |
|---|---|
| Node `cachePolicy` for the credit score | In-memory; our cache must persist and follow TD7 |
| `@langchain/langgraph-supervisor` / `-swarm` | Not the chosen pattern (TD2), and no longer featured in the JS docs |
| `modelFallbackMiddleware` | It would pick a model on the bank's behalf (D4) |
| `toolErrorMiddleware` | Its JS docs section is empty; a documented `createMiddleware({ wrapToolCall })` maps tool failures to situation labels instead. That middleware is required, not optional: without it, the agent's tool node answers the LLM with the schema parser's message and the arguments it refused (found in T14b) |
| A compiled agent's `.graph` used as a node | Undocumented; the documented wrapper node that calls the agent is used instead |
| `streamEvents` v3 | Experimental in our installed version (TD5) |

### TD19. Dependencies

Each dependency added during the build gets one line here.

| Package | Why |
|---|---|
| `@langchain/langgraph`, `langchain`, `@langchain/core` | The required agent framework (LangGraph) and `createAgent` with its middleware |
| `@langchain/openrouter` | The OpenRouter chat model. It's still 0.x, so it sits behind our own `ChatModelProvider` adapter |
| `zod` | Validation at every boundary, and the schema type for LangGraph state and interrupts |
| `drizzle-orm`, `drizzle-kit` (dev) | Typed, parameterised SQL and generated migrations; the schema is the single source for columns (TD12) |
| `better-sqlite3`, `@types/better-sqlite3` (dev) | The SQLite driver for Drizzle. Kept on the 12.x line because the checkpointer depends on it, so the app and LangGraph share one native build and one connection |
| `@langchain/langgraph-checkpoint-sqlite` | The documented SQLite checkpointer (`SqliteSaver`), so conversations survive a restart |
| `server-only` | Makes a client bundle fail to build if it imports server code, as the Next.js docs recommend. Tests map it to its empty build |
| `@stryker-mutator/core`, `@stryker-mutator/vitest-runner` (dev), **removed in TD28** | Mutation testing on the decision modules (TD16). Version 10 runs on Vitest 5, with a one-line `pnpm patch` (`patches/`): the runner names tests `suite test`, but Vitest 5 matches `suite > test`, so with per-test coverage no test ran and every mutant survived. Found in T5; the T3 trial's 17 kills were static mutants only. Drop the patch once the runner is fixed upstream |
| `shadcn`, `@base-ui/react`, `class-variance-authority`, `cn`, `tw-animate-css` | shadcn/ui (SPEC §5), added by `shadcn init`: the components are copied into `src/components/ui` and built on Base UI primitives; `cn` is shadcn's own class merger (in place of `clsx` + `tailwind-merge`); `shadcn` and `tw-animate-css` supply the theme CSS. `lucide-react`, also added by init, was removed until an icon is needed |
| `lucide-react` | The icon set `components.json` names. Back now that icons are needed: the shadcn Combobox's chevron, check and clear, and the Settings back arrow |
| `tsx` (dev) | Runs the TypeScript seed script (`pnpm db:setup`) with the project's path aliases. Already in the tree through Vitest; now a direct dependency because we call it |

### TD20. Runtime: Node 25

| Options | Choice | Trade-off |
|---|---|---|
| Node 24 LTS · **Node 25** | Node 25 (`.nvmrc`, `engines`, `@types/node` 25) | The user's call at Checkpoint A: it's the Node the project is developed on. The T2 spike was re-run on it: better-sqlite3 rebuilds, and the checkpointer and the full suite pass. Cost: 25 is a current release, not LTS, so its support window is shorter; moving back to 24 LTS is a one-line `.nvmrc` change plus a native rebuild |

### TD21. No pull requests

| Options | Choice | Trade-off |
|---|---|---|
| A PR per task, squash-merged · **a branch per task, merged into `develop` with `--no-ff`** | Branch + `--no-ff` merge, permanently (the user's call at Checkpoint A) | One developer and no second reviewer, so a PR would be ceremony. `--no-ff` keeps each task one visible unit in the history while keeping its atomic commits, which a squash would flatten. commitlint checks every commit in the `commit-msg` hook, so the CI PR-title job and the PR template went. Cost: no PR page to review a task on; the merge commit and `tasks/todo.md` stand in for it |

### TD22. The request pipeline

| Topic | Options | Choice | Trade-off |
|---|---|---|---|
| Where the checks live | Each route checks for itself · **one `handleRoute` every state-changing route goes through** | One pipeline | Origin, rate limit, session, body and idempotency key run in a fixed order, so no route can forget one. Ownership and the turn lock are a second wrapper for routes that run a turn |
| NIC typed in chat | Refuse the message · **replace it with `[NIC removed]` and carry on** | Replace | The customer isn't blocked for an honest mistake, and the model can explain that it doesn't need a NIC. Detection allows spaces and dashes, and is shared with the logger's redaction |
| Replayed idempotency key | Return the original response · **409** | 409 | A chat turn streams, so there's no single response to replay. A resend is a new key, so a genuine retry still works |
| Which error text may reach the browser | Zod's messages · **only the messages of fields a person typed** | Typed fields only | Schema messages for typed fields are written for people; anything else failing is a client bug and gets the generic template |
| Caller IP for rate limits | The socket address · **the first `X-Forwarded-For` entry** | `X-Forwarded-For` | Route handlers don't see the socket, and the reverse proxy (ARCHITECTURE §12) sets the header. Without that proxy the header could be forged, so it's trusted only in that deployment |
| CSP | Static headers in `next.config` · **a per-request nonce set in Next.js Proxy** | Nonce | The Next.js CSP guide's approach: the framework's inline scripts run without `'unsafe-inline'`. Costs dynamic rendering for pages. `upgrade-insecure-requests` is left out: HSTS covers production and it would break plain-HTTP localhost tests |

### TD23. The mock government API

| Topic | Options | Choice | Trade-off |
|---|---|---|---|
| How the app reaches it | Import its functions · **over HTTP, through the `CreditBureau` adapter** | HTTP | Exercises the real adapter, timeouts and status codes. Its route files under `app/api/mock-gov` are the only code that imports it (lint-enforced), and it wires its own database connection instead of using our composition root |
| NICs in its tables | Plain text, as a real bureau would hold them · **a SHA-256 of the NIC** | Hash | Its tables share our SQLite file, and no NIC is ever plain text in our database (FR-PLAT-02). Lookups normalise spacing and case first |
| Which calls count toward its per-IP limit | Only successful ones · **every call that reaches it**; "down" counts nothing | Every call reaching it | Matches a real metered API, and keeps our own "every attempt counts" budget honest (BR-CRED-03) |
| `rate_limited` mode's `Retry-After` | Next midnight · **one hour** | One hour | Different from the daily limit's, so the demo shows our block following `Retry-After` (BR-CRED-04) |

### TD24. Credit policy details

| Topic | Options | Choice | Trade-off |
|---|---|---|---|
| Making the last slot atomic | One conditional `UPDATE` in SQL · **read, decide and write in one `IMMEDIATE` transaction** | Transaction | The decision stays a pure function that Stryker can mutate meaningfully; SQLite's write lock makes it atomic across connections, shown by a two-connection test |
| When the cool-down starts | After any failure · **only when the attempts end in a retryable failure** (timeout, 5xx, network) | Retryable only | A 4xx or a malformed answer says the request or the bureau's data is wrong, not that it's struggling; it's counted, not retried, and doesn't stop the next customer |
| Parallel first checks for one customer | Merge in-flight requests · **let them both call** | Both call (D3) | Two tabs at once is rare at this scale; the worst case is one extra call, and the budget still caps the total |
| No NIC on the record | Throw · **`unavailable`, with no call** | `unavailable` | Shouldn't happen for a seeded customer, and the customer still gets the honest fallback |

### TD25. Chat transport and browser tests

| Topic | Options | Choice | Trade-off |
|---|---|---|---|
| Transport | WebSocket · `EventSource` · **SSE read from the `fetch` response of the POST** | SSE over the POST | One-way events are all a turn needs, and the POST carries the body and its idempotency key, which `EventSource` can't send. No socket server to run |
| A refused turn | An `error` event inside the stream · **an HTTP status before any stream starts** | HTTP status | Origin, session, ownership, a running turn and a pending card answer exactly as before (403, 401, 404, 409), so FR-WEB-03's 409 stays testable without reading a stream |
| When replies are sent | As each node writes them · **after the run, read back from the checkpoint** | After the run | Only validated text can be sent (FR-AGT-10), and a reload reads the same transcript. Typing and progress (LangGraph's `custom` stream) cover the wait |
| A dropped connection | Cancel the run · **let it finish** | Finish | Its side effects happen once, the turn lock is released when it ends, and a reload shows the result (P1-11) |
| What a reload restores | A conversation ID in the URL or browser storage · **the latest conversation started since this sign-in** | Since this sign-in | Nothing to keep in the browser or leak in a URL; the session ID already survives the step-up rotation. A new sign-in starts with an empty chat |
| A model for E2E without a key | A real key in CI · recorded responses · **a scripted provider that plays the specialists by rule** | Scripted (`E2E_SCRIPTED_MODEL=1`, set only by the browser tests' servers, TD27) | Browser tests run the real graph, gates and templates on every machine and cost nothing; the model's own behaviour is the evals' job. It is a `ChatModelProvider` adapter built on LangChain's `fakeModel`, so nothing else changes. The app refuses to start with it unless `DEMO_MODE=true`, so it can't replace a real model by accident |

### TD26. Triage, hand-back and callbacks

| Topic | Options | Choice | Trade-off |
|---|---|---|---|
| How triage runs | A `createAgent` with a response format · **one structured-output call, retried with LangChain's `withRetry` (3 attempts)** | One call | Triage has no tools, so an agent loop adds nothing. The specialists' retry middleware only exists inside `createAgent`, so triage retries through the runnable instead. Its calls are not in the per-conversation counts of FR-AGT-11, which come from the checkpointed history; it runs at most twice a turn |
| What triage reads | The whole conversation · **the last 6 messages, without tool traffic** | Last 6 | Enough to read a short answer such as "yes please" to an offer of a call, and cheap |
| A misroute that bounces | Trust the classifier · **don't send a message straight back to the specialist that handed it back** | Guard | A loop between triage and one specialist is impossible; the customer gets the redirect instead |
| Callback "reason" | Free text · **the journey the customer was on (`loan`, `kyc`, or `general`)** | Journey | One request per conversation and reason (FR-AGT-14) needs a fixed set; the team sees what the call is about without anyone reading chat |
| How long "talk to a person" lasts | Sticky, like the other journeys · **one turn** | One turn | After the request there is nothing more to do there, so the next message meets triage again |

### TD27. Configuration surface

| Topic | Options | Choice | Trade-off |
|---|---|---|---|
| What `.env.example` lists | Every variable the code reads · **only what an operator sets** (B20) | Operator settings | Five variables, each with an effect a bank would want. The rest is test wiring, set only in `playwright.config.ts` |
| The government API's address | A `GOV_API_BASE_URL` setting · **derived: the mock's routes on this server, from the `PORT` Next.js listens on** | Derived | Nothing to set or get wrong. The `CreditBureau` adapter still takes a base URL, so a real service would be a new address in the composition root, not new domain code |
| Model provider | A `CHAT_MODEL_PROVIDER` setting · **always OpenRouter; the rule-played model only behind the browser tests' `E2E_SCRIPTED_MODEL=1`** | OpenRouter | A deployment can't choose a fake model. The flag is still refused unless `DEMO_MODE=true` |
| Database file | A setting · **always `bank.db`**; the browser tests point `DATABASE_PATH` at their own file | `bank.db` | One SQLite file is the whole runtime (ARCHITECTURE §12); a test run never touches the demo data |

### TD28. A focused test suite, without Stryker

| Topic | Options | Choice | Trade-off |
|---|---|---|---|
| Mutation testing | Stryker on the decision modules (TD16) · **manual mutants only** | Manual mutants on the P0 and business-rule controls | Stryker removed: a patched test tool is more machinery than a take-home needs, and manual mutants keep the guarantee that a test fails when its behaviour breaks. Cost: nothing re-checks the boundaries automatically on every change |
| Suite size | A test for every rule and variant (740 cases, 22 E2E) · **about 100 cases, one E2E per journey** | 91 cases, 6 E2E | A reviewer can read the whole suite. Kept: a test per P0 at the lowest level that proves it, the rule boundary tables at their edges, the graph tests where a manipulated model tries to skip a gate, invent an outcome or put secrets in state, and a few module tests for transactions, idempotency and ownership. Cost: plumbing, adapters and secondary rules are covered by review and the journeys, not by their own tests |

## 3. Deferred: right idea, wrong time

| ID | Item | Why not now | When / how to add |
|---|---|---|---|
| D1 | A second factor (OTP/TOTP) | Step-up re-authentication is built now. A second factor needs an SMS or authenticator setup and adds no new insight for the demo | Before production; it's the control for stolen passwords. It slots into the same pause as step-up |
| D2 | Circuit breaker | The 5-a-day budget already caps calls to a failing API; a cool-down timestamp does the job | When the call limit or the number of upstream APIs grows |
| D3 | Merging duplicate in-flight requests | Two simultaneous checks for one customer are rare at 60 daily users; the worst case is one extra call | When concurrency grows |
| D4 | A fallback model | A hard-coded fallback picks a model on the bank's behalf, which breaks the bring-your-own-model promise. Retries cover transient errors | As a configurable fallback per agent |
| D5 | Postgres | SQLite runs with zero setup; same schema | When there's more than one app instance |
| D6 | Automatic cache-lifetime tuning | Each fetch already records whether the score changed, but tuning needs months of real data | After go-live, as a periodic review of that data |
| D7 | WhatsApp and mobile channels | The backend is channel-agnostic | Add a channel adapter |
| D8 | Sentry, LangSmith, Langfuse | Structured logs and the audit log cover the demo | Drop-in; no restructuring needed |
| D9 | Microservices | A modular monolith suits one small team and ~500 customers | Only if team size or load demands it |
| D10 | Learning the threshold from officer decisions | Needs months of officer outcomes. Every decision already stores its confidence, threshold and provisional outcome, and referrals have an `officer_decision` field | After go-live: a periodic risk-team review, later an ML model if the data supports it |
| D11 | A message collector node | Adds a wait to every turn (TD14) | If the WhatsApp channel shows customers sending fragmented messages |

## 4. Rejected: wrong idea, not just wrong time

| Item | Why |
|---|---|
| LLM-reported confidence for decisions | Uncalibrated, model-dependent, and a customer can talk it up (TD9) |
| A threshold that moves automatically | A governance risk in lending; a person changes it, with the data in front of them (B13) |
| Customer-triggered credit refresh | Lets anyone drain the bank-wide budget (BR-CRED-07) |
| Spreading calls across IPs to get round the rate limit | Breaks the government API's terms |
| Showing the credit score | B9 |
| Audit logs in the UI | B10 |
| A per-customer daily cap on assessments, against amount probing | It only reveals the customer's own band, every attempt is audited, and it would frustrate real customers (B16) |
| IP or device binding for sessions | Breaks mobile users on changing networks (TD10) |
| A humanizer agent | TD3 |
| Sentence-by-sentence release of replies | Too complex for the gain (TD4) |
