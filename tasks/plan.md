# Implementation Plan: Bank Assistant

**Task checklist:** [`todo.md`](todo.md), the single place where progress is ticked.

**Inputs:** [`SPEC.md`](../docs/SPEC.md) (what) · [`ARCHITECTURE.md`](../docs/ARCHITECTURE.md) (structure, build order) · [`CODING_STANDARDS.md`](../docs/CODING_STANDARDS.md) · [`TESTING_STANDARDS.md`](../docs/TESTING_STANDARDS.md)

## Overview

We build the system bottom-up along the module dependency order, but **in vertical slices**: each phase ends with something a person can run and see working. The riskiest unknowns are proven in Phase 1, before anything depends on them.

## How each task is worked

- **Branch:** `feat|fix|chore|docs/<module>-<slug>` off `develop`. Atomic Conventional Commits. Merged back with `git merge --no-ff`, so each task stays visible as one unit in the history. No PRs.
- **Test first** for every business rule (red → green). P0 tests are named with their ID.
- **Proof a test can fail:** Stryker for the decision modules (tooling in T3; scope added in T5, T10 and T11); a **manual mutant** for P0 controls outside Stryker, written in the task's *Verify* line.
- **Done means:**
  - `pnpm lint && pnpm typecheck && pnpm test:coverage` are green;
  - E2E is green if the UI or a route changed;
  - `CHANGELOG.md` is updated if the change is user-visible;
  - the docs are updated if a decision changed.
- **Before building a module**, the `test-engineer` persona reviews its test plan against the spec (TESTING_STANDARDS §10).
- **LangGraph/LangChain:** check the live official docs for our pinned versions before using any API.

## Phases

Full tasks, acceptance criteria and checkpoints are in [`todo.md`](todo.md).

| Phase | Tasks | Ends with (checkpoint) |
|---|---|---|
| 0 Decisions record | T0 | Every decision the spec cites exists in `DECISIONS.md` |
| 1 Foundation and risk spikes | T1–T4 | **A:** the riskiest patterns proven (handoff, single-use resume, SQLite on Node 25, Stryker) |
| 2 Identity | T5–T7b | **B:** a customer can sign in and out securely |
| 3 Credit | T8–T10 | **C:** credit policy proven by tests and mutation score |
| 4 Lending | T11–T12 | Decisions, assessments and applications |
| 5 Agent and journeys | T13–T19 (T14a–c) | **D:** J1 end to end · **E:** all journeys; every P0 has a test |
| 6 Evidence and delivery | T20–T23 | **F:** evals, audit, docs, release |

## Order and parallel work

```
T0 → T1 → T2 → T3 ─┬─ T4 → T13 ─────────────────────────┐
                   ├─ T5 → T6 → T7a → T7b ──────────────┤
                   ├─ T8 → T9 → T10 ─┐                  │
                   ├─ T11 ───────────┴─ T12 (+T5) ──────┴─ T14a → T14b → T14c → T15 ─┐
                   └─ T16 ───────────────────────────────────────────────────────── T17 → T18 → T19 → T20 → T21 → T22 → T23
```

Once T3 is done, **the agent skeleton (T4, T13), identity (T5–T7b), credit (T8–T10), rules (T11) and onboarding (T16) are independent** and can run in parallel worktrees. T14a onwards is sequential.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `Command.PARENT` doesn't hand off from a wrapper node as documented | High | Proven in T4; fallback is a parent conditional edge reading a "next step" written by the tool |
| Native SQLite or the checkpointer fails on Node 25 | High | Proven in T2 on Node 24, re-run on Node 25 at Checkpoint A; fallback is pinning Node 24 LTS in `.nvmrc` |
| Default loan model (GLM-5.3-Flash) is unreliable at tool calls | Medium | Gates are in code, so it's a quality risk only; evals compare it with Claude and GPT, and the default switches if it misses targets |
| Reasoning tokens eat the 400-token output limit | Medium | Checked in T13, the first task with live models (a real key is needed); raise the limit or set reasoning to none |
| Stryker doesn't support Vitest 5 yet | Medium | Checked first in T3; fallback is running Stryker with a Vitest 4 runner config for its scope only |
| The reviewer has no OpenRouter key | Medium | The README explains bring-your-own-key; unit, module and graph tests and E2E use fake models and run without a key |
| Time: a couple of days | High | Cut line below |

**Cut line, if time runs short:** keep every P0 test and the J1–J4 journeys. Cut in this order:
1. polish on the settings page;
2. the PNG export (keep the Mermaid diagrams);
3. UI styling beyond shadcn defaults.

## Resolved questions

1. **"No PRs" is permanent** (Checkpoint A, TD21). The PR template and the CI PR-title job are gone; CI runs on pushes to `develop` and `main`. The flow is task branch → `--no-ff` merge into `develop` → `develop` merged into `main` at the end.
