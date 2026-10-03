# Implementation Plan: Bank Assistant

**Task checklist:** [`todo.md`](todo.md), the single place where progress is ticked.

**Inputs:** [`SPEC.md`](../docs/SPEC.md) (what) · [`ARCHITECTURE.md`](../docs/ARCHITECTURE.md) (structure, build order) · [`CODING_STANDARDS.md`](../docs/CODING_STANDARDS.md) · [`TESTING_STANDARDS.md`](../docs/TESTING_STANDARDS.md)

## Overview

We build the system bottom-up along the module dependency order, but **in vertical slices**: each phase ends with something a person can run and see working. The riskiest unknowns are proven in Phase 1, before anything depends on them.

## How each task is worked

- **Branch:** `feat|fix|chore|docs/<module>-<slug>` off `develop`. Atomic Conventional Commits. Merged back with `git merge --no-ff`, so each task stays visible as one unit in the history.
- **Test first** for every business rule (red → green). P0 tests are named with their ID.
- **Proof a test can fail:** a **manual mutant** for each P0 control and business-rule boundary, written in the task's *Verify* line. Until T21 the decision modules also ran Stryker; T21 replaced it with manual mutants only (TD28).
- **Done means:**
  - `pnpm lint && pnpm typecheck && pnpm test` are green;
  - E2E is green if the UI or a route changed;
  - `CHANGELOG.md` is updated if the change is user-visible;
  - the docs are updated if a decision changed.
- **LangGraph/LangChain:** check the live official docs for our pinned versions before using any API.

## Phases

Full tasks, acceptance criteria and checkpoints are in [`todo.md`](todo.md).

| Phase | Tasks | Ends with (checkpoint) |
|---|---|---|
| 0 Decisions record | T0 | Every decision the spec cites exists in `DECISIONS.md` |
| 1 Foundation and risk spikes | T1–T4 | **A:** the riskiest patterns proven (handoff, single-use resume, SQLite on Node 25) |
| 2 Identity | T5–T7b | **B:** a customer can sign in and out securely |
| 3 Credit | T8–T10 | **C:** credit policy proven by tests |
| 4 Lending | T11–T12 | Decisions, assessments and applications |
| 5 Agent and journeys | T13–T19 (T14a–c) | **D:** J1 end to end · **E:** all journeys; every P0 has a test |
| 6 Evidence | T20–T21 | **F:** evals and a focused test suite |
| After the plan | Review and hardening, then T22 docs | See below |

## After T21: review and hardening

Manual testing and three read-only reviews (against the standards, against the requirements, and a docs-versus-code audit) found gaps the plan hadn't foreseen. Each fix touched a few files and they came one after another, so they went straight onto `develop` as small commits rather than task branches. Vitest grew from 91 to 157 cases over this phase.

| Area | What changed | Example commits |
|---|---|---|
| Seeing what the code did | Decisions record why their confidence came out as it did; each model reply and tool call is audited with its model, prompt version and tokens; cache hits and skipped calls are audited; `pnpm audit:trail`; the demo-only *Behind the scenes* panel | `cce51b1`, `f5fc290`, `911d406`, `c51b717`, `0da439e`, `93d5dc1` |
| Model behaviour | One situation label per ending instead of "outcome shown"; the code, not the model, decides whether a re-check runs; "tomorrow" only when the daily calls are used up; a request to act for someone else is declined plainly; a wider outcome-claim check | `ff05716`, `5a39e41`, `8ff70e6`, `3e3a168`, `e25ac3e` |
| Security | The mock government API answers only the bank's key; tool results are redacted; a leaked KYC prompt is caught; the cache lifetime can't exceed the stale window | `c72f3fa`, `e3b4091`, `d248b5d`, `ad8fe9e` |
| Demo and UI | Reset my demo data, age cached scores, a clearer Settings page, a fixed header and message box | `42a9362`, `65dbeb9`, `476610d`, `e1f29bc` |
| Tests and evals | Restored the call-limit and retry/cool-down/429 tests; new rows for missing bank data, band and repayment edges, the append-only audit and "404 means no history"; red-team 5 → 10, routing 4 → 20, a follow-ups suite; every mutant re-run on today's suite ([`todo.md`](todo.md#mutants-after-t21)) | `4eacd44`, `0858918`, `b7bf9b8`, `80b2f43`, `31de6af`, `1c9dad2`, `3a4203c`, `049fc6b`, `3dc5073`, `038fd44` |
| Docs (T22) | The README, the architecture diagrams and database design, the decisions index, the spec re-tagged against real tests, the changelog | `docs:` commits after `0e823d6` |

## Order and parallel work

```
T0 → T1 → T2 → T3 ─┬─ T4 → T13 ─────────────────────────┐
                   ├─ T5 → T6 → T7a → T7b ──────────────┤
                   ├─ T8 → T9 → T10 ─┐                  │
                   ├─ T11 ───────────┴─ T12 (+T5) ──────┴─ T14a → T14b → T14c → T15 ─┐
                   └─ T16 ───────────────────────────────────────────────────────── T17 → T18 → T19 → T20 → T21
```

Once T3 is done, **the agent skeleton (T4, T13), identity (T5–T7b), credit (T8–T10), rules (T11) and onboarding (T16) are independent** and can run in parallel worktrees. T14a onwards is sequential.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `Command.PARENT` doesn't hand off from a wrapper node as documented | High | Proven in T4; fallback is a parent conditional edge reading a "next step" written by the tool |
| Native SQLite or the checkpointer fails on Node 25 | High | Proven in T2 on Node 24, re-run on Node 25 at Checkpoint A; fallback is pinning Node 24 LTS in `.nvmrc` |
| Default loan model (GLM-5.3-Flash) is unreliable at tool calls | Medium | Gates are in code, so it's a quality risk only; evals compare it with Claude and GPT, and the default switches if it misses targets |
| Reasoning tokens eat the 400-token output limit | Medium | **Confirmed in T20** (a one-off live check, since removed): they count (GLM at `low` used 197 of 400). Loan and KYC now allow 400 extra output tokens for reasoning, so 400 visible tokens remain (TD6) |
| Whoever runs it has no OpenRouter key | Medium | The README explains bring-your-own-key; unit, module and graph tests and E2E use fake models and run without a key |
| Time: a couple of days | High | Cut line below |

**Cut line, if time runs short:** keep every P0 test and the J1–J4 journeys. Cut in this order:
1. polish on the settings page;
2. the PNG export (keep the Mermaid diagrams);
3. UI styling beyond shadcn defaults.

## Resolved questions

1. **Integration flow** (Checkpoint A, TD21): task branch → `--no-ff` merge into `develop` → `develop` merged into `main` at the end. CI runs on pushes to `develop` and `main`.
