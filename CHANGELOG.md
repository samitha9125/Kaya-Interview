# Changelog

All notable changes to this project are documented here, written for people
rather than generated from commits. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/). Releases are git tags.

## [Unreleased]

### Added

- Next.js 16 + TypeScript project on pnpm, with LangGraph, LangChain and the OpenRouter integration installed.
- Quality gates: ESLint (300-line file limit), Prettier, strict TypeScript.
- Conventional Commits enforced locally (Husky + commitlint) and on PR titles in CI.
- Pre-commit secret scan for API keys, private keys and `.env` files.
- Test tooling: Vitest with an 80% coverage gate, Playwright e2e, promptfoo evals.
- GitHub Actions CI, a manual eval workflow, and a pull request template.
- The server refuses to start, with a message naming each problem, when the encryption key, approval threshold, cache lifetime or demo flag is missing or invalid.
- `pnpm db:setup` creates the local SQLite database; conversations and the audit trail survive a restart.

### Changed

- `.env.example` documents every setting. The admin password is gone, and `AUTO_DECISION_THRESHOLD` is in basis points (`9500` = 95%).
