# Bank Assistant

An AI chat assistant for a small local bank. It helps customers check loan eligibility, apply for a loan, and start opening an account (KYC), built on **LangGraph.js** with bring-your-own-key model access through **OpenRouter**.

> **Status:** environment ready. Specification in progress.

## Quick start

Requires Node 25 (`.nvmrc`) and pnpm 10.

```bash
pnpm install
cp .env.example .env.local        # then fill in the values
pnpm db:setup                     # create the local database
pnpm exec playwright install chromium   # once, for e2e tests
pnpm dev                          # http://localhost:3000
```

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Run, build, serve |
| `pnpm db:setup` | Create or migrate the local SQLite database (`bank.db`); safe to re-run |
| `pnpm db:generate` | Generate a migration after a Drizzle schema change |
| `pnpm lint` · `pnpm format:check` · `pnpm typecheck` | Static checks |
| `pnpm test` | Unit, module and graph tests (Vitest) |
| `pnpm test:mutation` | Mutation testing (Stryker) on the decision modules; fails below 80% |
| `pnpm test:e2e` | End-to-end tests (Playwright, Chromium) |
| `pnpm eval` · `pnpm eval:view` | Prompt evals (promptfoo) and the results viewer |
| `pnpm secrets:scan` | Scan all tracked files for secrets |

## Quality gates

| Where | What runs |
|---|---|
| `pre-commit` | ESLint + Prettier on staged files, secret scan on staged files |
| `commit-msg` | commitlint ([Conventional Commits](https://www.conventionalcommits.org)) |
| `pre-push` | Typecheck + unit tests |
| CI (push to `develop` or `main`) | Secret scan, prod dependency audit, format, lint, typecheck, tests, build, e2e |
| CI (manual) | Evals against a real model (needs the `OPENROUTER_API_KEY` secret) |

**About the secret scan:** `scripts/secret-scan.mjs` is a small, dependency-free safety net. On a real repository, also turn on [GitHub secret scanning with push protection](https://docs.github.com/en/code-security/secret-scanning/introduction/about-push-protection) or use a service such as GitGuardian.

## How this repo is worked on

- `main` holds reviewed milestones; `develop` is the integration branch. Each plan task is a short-lived branch off `develop`, merged back with `git merge --no-ff` so the task stays one visible unit, then deleted. There are no PRs, so every commit follows Conventional Commits as written (checked by the `commit-msg` hook). `develop` merges into `main` at the end, tagged as a release.
- [`CHANGELOG.md`](CHANGELOG.md) is written by hand for readers; releases are git tags.
- [`CLAUDE.md`](CLAUDE.md) holds the rules for AI-assisted work, and `.mcp.json` connects the LangChain docs so LangGraph code follows the current API.

## Documentation

| Document | Purpose |
|---|---|
| `docs/SPEC.md` | What the system does *(next)* |
| `tasks/plan.md` · `tasks/todo.md` | Build plan and task checklist |
| `docs/ARCHITECTURE.md` · `docs/DECISIONS.md` · `docs/PROCESS.md` | How it works, why, and how we worked *(during the build)* |
