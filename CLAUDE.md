# CLAUDE.md

Banking assistant: a LangGraph.js chatbot for a small local bank (loan eligibility/application and account opening).

## Start here

- Work in stages: spec (`/agent-skills:spec`) → plan (`/agent-skills:plan`) → build. Don't start a stage without the user's explicit approval of the previous one.
- The build plan is `tasks/plan.md`; the task checklist is `tasks/todo.md`. Work one task at a time, in order.
- Narrow scope, full depth. Don't add or even mention things the spec doesn't ask for. Anything we discussed and left out goes in the decision register with a reason.

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

## Reviewing and demo

The demo customers, the endings, the demo script and the reading order are in [`README.md`](README.md). Keep them there; don't repeat them here.

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
