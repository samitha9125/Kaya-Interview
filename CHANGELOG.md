# Changelog

All notable changes to this project are documented here, written for people
rather than generated from commits. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/). Releases are git tags.

## [Unreleased]

The first release: both journeys, talking to a person, Settings, the audit trail and the evals.

### Added

- **Loan journey.** A customer checks a loan, re-enters their password, consents to the credit check and gets one of three endings: eligible (then confirms an application), not eligible with a plain reason, or referred to a loan officer. One open application per customer.
- **Account opening.** Anyone, guests included, fills a secure KYC form; the result is an unverified pending application that the branch completes. The reply is the same whether or not the NIC already belongs to a customer.
- **Talk to a person.** A callback request, at once for a signed-in customer or with a short contact card for a guest.
- **Credit policy for a 5-calls-a-day API.** A 30-day score cache, a bank-wide daily budget, one retry, a 15-minute cool-down, a 429 block, and a stale score (up to 90 days) that always goes to an officer.
- **Settings.** Each assistant role's model, chosen from the OpenRouter catalogue with its price. In demo mode, controls to reset the government limit, clear or age the cache, change how the mock behaves, and reset a customer's demo data.
- **Audit trail.** Every consent, government call, decision and model reply (model, prompt version and tokens; never the text), append-only. `pnpm audit:trail` prints one case as a timeline, and the demo-only *Behind the scenes* panel shows it live.
- **Evals.** promptfoo suites for routing, refusals, red-team attacks, tone and follow-ups after an outcome, on the default models plus Claude Haiku 4.5 and GPT-5.6 Luna.
- `pnpm graph:draw` writes the agent graph from the compiled code, so the diagram can't drift.

### Security

- Identity only from server-side sessions (hashed tokens, idle and absolute timeouts, revocable sign-out); lockout after five wrong passwords; a password re-entry before the credit check and before submitting.
- The model never sees the score and never receives a password, a form or a NIC: pauses resume with references only, and NIC-shaped text is stripped before the graph.
- Replies are validated before display; a claimed outcome that doesn't match the decision, or a leaked instruction, is replaced.
- A nonce-based Content Security Policy, origin checks, idempotency keys, and a mock government API that answers only the bank's key.
- The app refuses to start when a security setting is invalid.

### Quality

- Tests focused on what would hurt the bank: unit, module and graph tests for every P0 control and decision boundary, a scripted model that tries to skip gates, and one browser test per journey. Hand-made mutants show each key test fails when its control breaks.
