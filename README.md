# Bank Assistant

A LangGraph.js chat assistant for a small Sri Lankan bank. Customers check whether they can get a loan, apply for one, and start opening an account. **The LLM talks; code decides.** Identity, money, consent and data access never depend on what the model says.

## What it guarantees

Each guarantee is enforced in code and proven by a deterministic test that names its ID. Search the ID to find the proof.

| Guarantee | How | Proof |
|---|---|---|
| Identity comes only from the signed-in session | Tools take no identity arguments, and NIC-shaped text is stripped before the model sees a message | [`P0-02`](src/server/harness/chat-input.test.ts), [`P0-03`](src/server/agent/loan-flow.gates.test.ts) |
| No credit check without a fresh password and recorded consent | The gates are graph nodes, not prompt instructions; the model can't skip them | [`P0-01`, `P0-03`](src/server/agent/loan-flow.gates.test.ts) |
| Never a sixth government call in a day | A call slot is taken atomically before every attempt, retries included | [`P1-04`](src/server/modules/gov-credit/budget.test.ts) |
| Rules decide; the model never sees the score | A deterministic rules engine sets the outcome; the model gets a situation label | [`P0-07`, `P0-08`](src/server/modules/lending/decide.test.ts) |
| One customer can't reach another's conversation | Every conversation route checks the owner and answers "not found" otherwise | [`P0-04`](src/server/agent/conversations/ownership.test.ts) |
| A reply is checked before anyone sees it | Replies are buffered, then validated against the decision in state | [`P0-05`, `P0-06`](src/server/agent/validate-reply.test.ts) |

The full failure catalogue (19 P0 cases and their tests) is [`SPEC.md` §8](docs/SPEC.md). One check is best-effort and labelled as such: spotting a made-up outcome in free text uses a word list, so it's measured by evals rather than guaranteed.

## Run it

You need Node 25 (see `.nvmrc`), pnpm 10 and an [OpenRouter](https://openrouter.ai) API key.

**1. Install**

```bash
pnpm install
cp .env.example .env.local
```

**2. Fill in `.env.local`**

| Setting | What to put |
|---|---|
| `OPENROUTER_API_KEY` | Your OpenRouter key |
| `APP_ENCRYPTION_KEY` | A new random key: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `DEMO_MODE` | Leave it as `true` |

**3. Create the database and start**

```bash
pnpm db:setup   # creates bank.db with ten demo customers
pnpm dev        # http://localhost:3000
```

**4. Sign in**

| Customer number | Password |
|---|---|
| `C1001` to `C1010` | `Demo@1234` |

The government credit API is a mock built into the app, so there is nothing else to set up.

**Tests.** They don't need an OpenRouter key, because a scripted model stands in for the LLM.

```bash
pnpm test                               # unit, module and graph tests
pnpm exec playwright install chromium   # once, before the first browser run
pnpm test:e2e                           # browser tests
```

## Try it

**Pick a customer.** Each one is set up to reach a particular ending.

| Customer | What happens |
|---|---|
| C1001, C1008, C1010 | Eligible, then an approved application after you confirm |
| C1002 | Not eligible: credit profile |
| C1007 | Not eligible: repayments too high |
| C1009 | Not eligible: the amount is over the limit for their band |
| C1003 | Referred to a loan officer: a borderline case |
| C1004 | Referred: no credit history |
| C1006 | Referred: no income on the bank's record |
| C1005 | Already has an open application, so no new check |

To try a customer again, go to **Settings → Reset my demo data**.

**See what the code is doing.** Click the *Behind the scenes* icon at the top right of the chat. It shows how many government calls are left today, whether the next check can call, how old the customer's saved score is, and this conversation's audit trail. To replay any past case in the terminal: `pnpm audit:trail C1001`.

**Demo: the cache and the daily limit (about 3 minutes).** Keep *Behind the scenes* open the whole time.

| Step | Do this | You should see |
|---|---|---|
| 1 | Sign in as C1001 and check a loan | "Call 1 of 5 today" |
| 2 | Settings → Reset my demo data, then check again | The saved score is reused; no government call |
| 3 | Settings → government behaviour **Error**, then check as another customer | One retry, a 15-minute cool-down, and an offer of a call back |
| 4 | Set the behaviour back to **Normal** and press **Reset limit**. Then check as customers who haven't been checked yet (not C1005) until the panel shows 5 of 5 calls used, and check once more | That last check makes no call: "daily limit reached" |
| 5 | Press **Age cached scores**. As C1001, reset your demo data and check again | The old score is used, so the case goes to a loan officer |
| 6 | Press **Reset limit** | Back to normal |

## Read in this order

| Step | Document | What you'll find |
|---|---|---|
| 1 | [`docs/SPEC.md`](docs/SPEC.md) | What it does: four journeys, the business rules, and the failure catalogue (§8) with a severity and a test for each case |
| 2 | [`tasks/plan.md`](tasks/plan.md), [`tasks/todo.md`](tasks/todo.md) | How it was built: phases, risk spikes first, checkpoints, and each task's result and mutant |
| 3 | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System design: the system view (§3), the agent graphs (§7), the database design (§9), security (§10), the credit-check flow (§11) and scaling (§12) |
| 4 | [`docs/DECISIONS.md`](docs/DECISIONS.md) | Why: start with the ten-row index at the top |
| 5 | [`docs/CODING_STANDARDS.md`](docs/CODING_STANDARDS.md), [`docs/TESTING_STANDARDS.md`](docs/TESTING_STANDARDS.md) | The rules the code and tests follow |
| 6 | [`CHANGELOG.md`](CHANGELOG.md) | What's in this release |

## Evidence

| What | Where |
|---|---|
| Tests | Vitest (unit, module and graph tests against a real in-memory SQLite and a scripted adversarial model) and 6 Playwright journeys. Each test names the requirement it proves |
| Proof the tests can fail | A hand-made mutant per P0 control and decision boundary, recorded in [`tasks/todo.md`](tasks/todo.md) |
| Evals | promptfoo suites for routing, refusals, red-team attacks, tone and follow-ups, run on real models: results pending the final run |
| Audit trail | Every model reply (model and prompt version, no text), consent, government call and decision, append-only |

## How it was built

The work ran in gated stages: the architecture and standards first, then the spec, then a plan of 27 tasks with checkpoints, with the riskiest patterns proven in spikes before anything depended on them. Nothing moved to the next stage without approval.

The code was written with Claude Code under the project's own rules. [`CLAUDE.md`](CLAUDE.md) imports the architecture and both standards, ESLint enforces the module boundaries, git hooks run lint, tests and a secret scan, and the LangChain docs are wired in through MCP so LangGraph code follows the current API. Separate read-only review sessions checked the code against the standards and the spec, and their findings were fixed before release.

Two turning points are worth knowing. The first build ended with 740 tests and mutation tooling; it was cut to a focused suite that proves the rules and the P0 controls ([TD28](docs/DECISIONS.md#td28-a-focused-test-suite-without-stryker)). And after task T21, the fixes from manual testing and review went straight onto `develop` as small commits rather than task branches.

`git log --first-parent develop` shows one merge per task.

## Configuration

Five operator settings, all in [`.env.example`](.env.example): the OpenRouter key, the encryption key, the auto-decision threshold (default 95%), the credit-score cache lifetime (default 30 days) and demo mode. The app refuses to start if a security setting is invalid.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` · `pnpm build` · `pnpm start` | Run, build, serve |
| `pnpm db:setup` | Create or migrate `bank.db` and add the demo customers; safe to re-run |
| `pnpm audit:trail <customer \| conversation \| reference>` | One case's audit trail as a timeline |
| `pnpm graph:draw` | Write the agent graph from the compiled code to `docs/diagrams/agent-graph.mmd` |
| `pnpm lint` · `pnpm format:check` · `pnpm typecheck` | Static checks |
| `pnpm test` · `pnpm test:e2e` | Vitest; Playwright |
| `pnpm eval` · `pnpm eval:view` | Evals on real models (needs the key, costs a little) and the results viewer |
| `pnpm db:generate` · `pnpm smoke:models` · `pnpm secrets:scan` | New migration; a one-off check of each model's token use; secret scan |

**Quality gates.** Pre-commit runs ESLint, Prettier and the secret scan on staged files; commit-msg runs commitlint; pre-push runs the typecheck and Vitest. CI on `develop` and `main` runs the secret scan, a dependency audit, format, lint, typecheck, tests, the build and E2E. Evals run in CI only on demand.

## Known limits

| Limit | Why it's acceptable here | Before production |
|---|---|---|
| The reply wording check is a word list | The outcome itself can't be changed by text, only described wrongly | Keep growing the eval set |
| Step-up is a password, not a second factor | Enough for the demo ([D1](docs/DECISIONS.md#3-deferred-right-idea-wrong-time)) | Add OTP in the same pause |
| Settings has no operator sign-in | Its controls are for testers in demo mode ([D12](docs/DECISIONS.md#3-deferred-right-idea-wrong-time)) | An operator role |
| One instance, one SQLite file | 50–60 daily users | Postgres and a shared lock store ([ARCHITECTURE §12](docs/ARCHITECTURE.md#12-observability-and-runtime)) |
| English only | Sinhala and Tamil need their own evaluation (B11) | Per-language evals |
