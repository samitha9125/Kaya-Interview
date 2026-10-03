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
- A sign-in screen with an "I'm new" option for guests, and an empty chat screen with sign-out. Signing out ends the session on the server, so a copied cookie stops working.
- Every page and API response carries security headers: a nonce-based Content Security Policy that forbids framing, `nosniff`, no referrer, and HSTS in production.
- Loan assessments are recorded with the customer's consent, outcome, confidence and the threshold used; a referral creates an application for a loan officer, and a customer can have only one open application. `pnpm db:setup` also gives each demo customer a government credit record designed for one demo ending, and C1005 starts with an open application.

- The chat runs the loan journey: a "Check a loan" button, replies that appear whole after they're checked, a typing or progress line while the bank works, and secure cards to re-enter the password, give consent and confirm the application. The chat input is locked while the assistant works or a card is waiting, and reloading the page brings the conversation back where it was.
- Anyone can start opening an account from the chat, including guests: a secure form checks each detail and says what to fix, a summary shows what the bank stored, and the application waits, unverified, for a branch visit with the original NIC. The answer is the same whether or not the NIC already belongs to a customer.
- "Talk to a person" asks the team for a call back: at once for a signed-in customer, or with a short name-and-number card for a guest. Asking twice in a conversation doesn't make a second request.
- Messages typed without pressing a starter are sorted to the right journey, and the assistant hands a conversation over when the customer changes topic. Anything the assistant doesn't handle gets a short redirect.
- A Settings page, linked from the chat: whether the OpenRouter key is configured, the auto-decision threshold, and each assistant role's model with its price and context, flagged if it's no longer offered. In demo mode it also changes models (for new conversations), resets today's government limit, clears the credit cache and sets how the mock government service behaves. Outside demo mode it's read-only.
- Settings is laid out as three cards (Status, Models, Demo controls): a Connected or Missing badge for the model key, one model picker per assistant role with its price and context underneath and a single Save changes, and each demo control as a row that says what it does. A signed-in demo customer can reset their own demo data (applications, conversations) to try a journey again; the audit log is kept.
- `pnpm eval` runs small routing, refusal, red-team and tone suites on real models (the defaults, Claude Haiku 4.5 and GPT-5.6 Luna) through the real assistant.
- The audit trail explains each loan decision (the band, its maximum, repayment-to-income and each confidence penalty, never the score) and records every assistant reply and tool call with its model and prompt version. `pnpm audit:trail <customer number | conversation ID | reference code>` prints one case as a plain-English timeline.

### Changed

- The test suite is focused on what the bank would be hurt by: 91 unit, module and graph tests (a test for every P0, the business-rule boundaries, and a model trying to skip a gate or invent an outcome) and one browser test per journey plus two security checks. Mutation testing with Stryker (`pnpm test:mutation`) is gone; manual mutants prove the key tests fail when their control breaks.
- A loan amount over the customer's band maximum, with otherwise clear data, is a final "not eligible" instead of a referral to an officer. Demo customer C1009 shows it.
- The loan and account-opening assistants allow room for the model's reasoning on top of a 400-token reply, so replies are no longer cut short.
- `.env.example` lists only the five settings an operator sets: the OpenRouter key, the encryption key, the auto-decision threshold, the cache lifetime and demo mode. The admin password is gone, and `AUTO_DECISION_THRESHOLD` is in basis points (`9500` = 95%). The government credit service is always the built-in mock, and the assistant always uses OpenRouter.
- The chat fills the screen: the header stays at the top, only the conversation scrolls, the message box stays at the bottom, and the view follows each new message, progress line and card (a card opens at its top). Sign out sits at the far right in red, apart from Settings.
- Settings shares the chat's header (without its own Settings link), has a back arrow beside its title, and from laptop width puts Status and Models on the left and Demo controls on the right, so nothing hides below the fold. Phones keep one column.
- Each model picker on Settings, and the demo's Government CRIB Service behaviour (renamed from Government service behaviour), is a searchable list: type to filter, pick with the mouse or keyboard. The list has a fixed height and scrolls inside it, so a long catalogue no longer fills the screen.
- A follow-up after a loan result ("really?", "why?") gets an answer that matches what the customer was shown: the assistant now knows which ending it was (eligible, not eligible, referred, an application already open, an expired result, a check that couldn't run) instead of only that "a result was shown". It no longer claims a check ran when none did, and it points to a loan officer and a call for the details.
