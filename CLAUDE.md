# CLAUDE.md

Banking assistant: a LangGraph.js chatbot for a small local bank (loan eligibility/application and account opening). Built as a take-home for a Tech Lead (GenAI/LLM) role.

## Start here

- Work in stages: spec (`/agent-skills:spec`) → plan (`/agent-skills:plan`) → build. Don't start a stage without the user's explicit approval of the previous one.
- Narrow scope, full depth. Don't add or even mention things the brief didn't raise. Anything we discussed and left out goes in the decision register with a reason.

## Commands

| Task | Command |
|---|---|
| Dev server | `pnpm dev` |
| Lint / format / types | `pnpm lint` · `pnpm format:check` · `pnpm typecheck` |
| Unit tests (+ coverage gate) | `pnpm test` · `pnpm test:coverage` |
| E2E | `pnpm test:e2e` |
| Evals | `pnpm eval` (needs `OPENROUTER_API_KEY` once the agent provider exists) |
| Secret scan | `pnpm secrets:scan` |

Use pnpm only. Node 24 (`.nvmrc`).

## Code rules

- TypeScript strict, no `any`, max **300 lines per file**. Modular monolith: feature modules with clear boundaries, no microservices.
- Validate every external input with zod at the boundary.
- **Security invariants:** the NIC and the credit score never reach the LLM. Tools get the customer's identity from LangGraph runtime context, never from tool arguments. The credit check is reachable only after login and recorded consent, enforced in graph code.
- Deterministic logic (cache, budget, rules engine, confidence, auth, idempotency) is written test-first and stays above the 80% coverage gate.
- **LangGraph/LangChain:** check the current docs (the `langchain-docs` MCP server) before using any API. As verified on 2026-10-01: `StateSchema` over `Annotation.Root`, `createAgent` + middleware over `createReactAgent`, `ChatOpenRouter` behind our own adapter.

## Git

- Trunk-based: short-lived branches (`feat/…`, `fix/…`, `chore/…`, `docs/…`), one plan task per PR, squash merge.
- Conventional Commits, enforced by commitlint locally and on PR titles in CI. Suggested scopes: `triage`, `loan`, `kyc`, `credit`, `auth`, `admin`, `audit`, `ui`, `evals`, `deps`, `security`.
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
