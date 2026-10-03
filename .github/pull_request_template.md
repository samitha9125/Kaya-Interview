## What & why

<!-- One or two sentences. Link the `tasks/todo.md` task this change delivers. -->

Plan task: <!-- e.g. T4 — credit-score cache -->

## Changes

-

## Deliberately not changed

<!-- Anything nearby you chose not to touch, and why. Delete if empty. -->

## How it was tested

- [ ] Unit tests (`pnpm test:coverage`)
- [ ] E2E (`pnpm test:e2e`) if UI or API routes changed
- [ ] Evals (`pnpm eval`) if prompts, tools, or graph routing changed

## Checklist

- [ ] PR title follows Conventional Commits (it becomes the squash commit)
- [ ] No secrets, `.env` files, or real customer data
- [ ] Security rules hold: NIC and credit score never reach the LLM; credit tool only after login + consent
- [ ] Files stay under 300 lines
- [ ] `CHANGELOG.md` updated under **Unreleased** if user-visible
- [ ] Docs updated (`SPEC`, `ARCHITECTURE`, `DECISIONS`) if behaviour or a decision changed
