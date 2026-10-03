# Changelog

All notable changes to this project are documented here, written for people
rather than generated from commits. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/). Releases are git tags.

## [Unreleased]

### Added

- Next.js 16 + TypeScript project on pnpm, with LangGraph, LangChain and the OpenRouter integration installed.
- Quality gates: ESLint (300-line file limit), Prettier, strict TypeScript.
- Conventional Commits enforced locally (Husky + commitlint).
- Pre-commit secret scan for API keys, private keys and `.env` files.
- Test tooling: Vitest, Playwright e2e, promptfoo evals.
- GitHub Actions CI on pushes to `develop` and `main`, and a manual eval workflow.
- The server refuses to start, with a message naming each problem, when the encryption key, approval threshold, cache lifetime or demo flag is missing or invalid.
- `pnpm db:setup` creates the local SQLite database and ten demo customers (`C1001`–`C1010`); conversations and the audit trail survive a restart.
- Sign-in with a customer number and password. Five wrong passwords in a row pause sign-in for that account for 15 minutes, and one address can try at most 10 times in 15 minutes. A refused sign-in never says whether the customer number exists.
- Every page and API response carries security headers: a nonce-based Content Security Policy that forbids framing, `nosniff`, no referrer, and HSTS in production.

### Changed

- `.env.example` documents every setting. The admin password is gone, and `AUTO_DECISION_THRESHOLD` is in basis points (`9500` = 95%).
