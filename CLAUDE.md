# CLAUDE.md

Banking assistant: a LangGraph.js chatbot for a small local bank (loan eligibility/application and account opening). Built as a take-home for a Tech Lead (GenAI/LLM) role.

## Start here

- Work in stages: spec (`/agent-skills:spec`) → plan (`/agent-skills:plan`) → build. Don't start a stage without the user's explicit approval of the previous one.
- The build plan is `tasks/plan.md`; the task checklist is `tasks/todo.md`. Work one task at a time, in order.
- Narrow scope, full depth. Don't add or even mention things the brief didn't raise. Anything we discussed and left out goes in the decision register with a reason.

## Commands

| Task | Command |
|---|---|
| Database + demo data | `pnpm db:setup` (delete `bank.db*` first for a clean start) |
| Dev server | `pnpm dev` |
| Decision trail for one case | `pnpm audit:trail <customer number, conversation id or reference code>` |
| Lint / format / types | `pnpm lint` · `pnpm format:check` · `pnpm typecheck` |
| Unit, module and graph tests | `pnpm test` |
| E2E | `pnpm test:e2e` |
| Evals | `pnpm eval` (needs `OPENROUTER_API_KEY`; real models, so it costs a little) |
| Secret scan | `pnpm secrets:scan` |

Use pnpm only. Node 25 (`.nvmrc`).

## Reviewing and inspecting

For a human or AI reviewer. Read in this order: `docs/ARCHITECTURE.md` (structure), `docs/DECISIONS.md` (why), `docs/SPEC.md` (what, with the §8 failure catalogue), then the code.

| To check | Do |
|---|---|
| The system runs | `.env.local` from `.env.example`, then `pnpm install`, `pnpm db:setup`, `pnpm dev`. Sign in as `C1001`–`C1010`, password `Demo@1234` |
| Each ending | Eligible: C1001, C1008, C1010. Not eligible: C1002 (credit profile), C1007 (repayments), C1009 (amount over limit). Referred: C1003 (borderline), C1004 (no history), C1006 (no income). Open application already: C1005. To retry a customer: Settings → Reset my demo data |
| Why a case ended as it did | In demo mode, the **Behind the scenes** icon (top right of the chat) shows it as it happens. Or `pnpm audit:trail <customer number, conversation id or reference code>`: the timeline of consent, government call, rules, confidence and its reasons, threshold and outcome. The customer sees only the template; the detail is the bank's |
| The guarantees | Search a P0 ID (e.g. `P0-04`) to find its test; `pnpm test` runs them all with no API key |
| What the LLM may do | `src/server/agent/` (graph, prompts, tools); everything in `src/server/modules/` runs without a model |

The tests cover business rules, decision gates and the P0 controls. The Next.js layer (route plumbing, headers, middleware) follows the framework's practices and is deliberately not unit-tested.

### Caching and the government limit in 3 minutes

Open **Behind the scenes**; every step shows there.

1. C1001 checks a loan → "call 1 of 5 today".
2. Settings → Reset my demo data; check again → served from cache, no government call.
3. Settings → behaviour Error; another customer checks → one retry, a 15-minute cool-down, a call-back offer.
4. Behaviour Normal, Reset limit; check with 5 different customers → the 6th is skipped, "daily limit reached".
5. Age cached scores; C1001 resets their demo data and checks again → the stale score stands in → referred.
6. Reset limit.

## Architecture and standards (always apply)

Every change, including bug fixes, must stay within these. If a change needs to break one, stop and ask first.

@docs/ARCHITECTURE.md
@docs/CODING_STANDARDS.md
@docs/TESTING_STANDARDS.md

## Git

- Branches: `main` holds reviewed milestones only; `develop` is the integration branch. Each plan task is built on its own short-lived branch and merged into `develop` with `git merge --no-ff`, so each stays one visible unit in the history. `develop` merges into `main` (merge commit) at the end.
- Conventional Commits, enforced by commitlint in the `commit-msg` hook. Suggested scopes: `triage`, `loan`, `kyc`, `credit`, `auth`, `admin`, `audit`, `ui`, `evals`, `deps`, `security`.
- Atomic commits whose body explains *why*. Never mix formatting with behaviour changes.
- Update `CHANGELOG.md` under **Unreleased** for user-visible changes. Releases are git tags.
- Hooks: pre-commit (lint-staged + secret scan), commit-msg (commitlint), pre-push (typecheck + tests). Don't bypass them with `--no-verify`.

## Writing docs

Concise, humanized, table-first. Business decisions and technical decisions are kept separate. One job per document.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
