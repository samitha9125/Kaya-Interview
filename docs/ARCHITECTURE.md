# Architecture

The structure of the bank assistant and the rules that keep it that way. **What** the system does is in [`SPEC.md`](SPEC.md); **why** each choice was made is in [`DECISIONS.md`](DECISIONS.md).

**Principle: the LLM talks, code decides.** Identity, money, consent and data access are deterministic code paths. The LLM handles conversation and never holds a lever.

## 1. Constraints that shape the design

- A small bank: ~500 customers, 50–60 daily users. One instance and one database are enough.
- The government credit API allows 5 calls a day per IP and is unreliable. It must be treated as scarce and fallible.
- A credit score is sensitive. Identity can only come from a signed-in session, never from chat.
- The bank brings its own model key and may change models or providers.

## 2. Style

| Choice | In one line |
|---|---|
| **Modular monolith** | One Next.js app; feature modules with enforced boundaries instead of services |
| **Ports and adapters** | Domain code depends on interfaces; external systems plug in behind them |
| **Router agent** | Code plus a cheap classifier picks the specialist; each specialist sees only its own journey |

## 3. System view

```mermaid
flowchart TB
  web["Web: Chat · Settings (Next.js, shadcn/ui)"] --> harness
  harness["Harness: route handlers + request pipeline"] --> agent & modules
  agent["Agent: LangGraph router graph"] --> modules
  modules["Domain modules: auth · settings · gov-credit · lending · onboarding"] --> platform
  platform["Platform: db · crypto · audit · config · logger"]
  modules -. ports .- adapters
  agent -. port .- adapters
  adapters["Adapters: HttpGovBureau · OpenRouterProvider · OpenRouterCatalog"] -. HTTPS .-> ext["Government API (mocked) · OpenRouter"]
```

## 4. Dependency rules

Enforced by ESLint `no-restricted-imports`.

| Layer | May import | Never imports |
|---|---|---|
| `app/` | harness, UI components | agent, modules, adapters, platform |
| `server/harness` | agent, modules (`index.ts` only), platform, composition root | adapters directly |
| `server/agent` | modules (`index.ts` only), its own ports, platform | harness, adapters |
| `server/modules/*` | their own ports, platform, other modules' `index.ts` (acyclic) | LangChain/LangGraph, agent, harness, adapters |
| `server/adapters` | port types, platform, external SDKs | domain logic |
| `server/platform` | nothing above it | everything above it |
| `server/mock-gov` | platform | anything else. Nothing imports it; it's reached over HTTP like a real external API |

## 5. Ports and adapters

A module declares the port it needs; an adapter implements it for one external system. **`server/composition.ts` is the only file that knows which adapters are in use.**

| Port (owner) | Contract | Adapter today | Swapping it means |
|---|---|---|---|
| `CreditBureau` (gov-credit) | `fetchScore(nic)` returns a validated result; declares `callsPerDay` | `HttpGovBureau` (calls the mock) | A new endpoint, an API version or the real service is a new adapter. Cache, budget, backoff and fallback rules don't change |
| `ChatModelProvider` (agent) | `chatModel(role)` returns a LangChain chat model | `OpenRouterProvider` | A direct provider, Azure, or a self-hosted model |
| `ModelCatalog` (settings) | Lists tool-capable models with price and context | `OpenRouterCatalog` | Any other catalogue |
| `Clock`, `IdGenerator` (platform) | `now()`, `newId()` | System | Deterministic fakes in tests |

**The database is deliberately not behind a port.** Drizzle already isolates the SQL dialect, so moving to Postgres is a dialect change; a repository layer would add files without adding options.

## 6. Modules

| Module | Responsibility | Depends on | Owns |
|---|---|---|---|
| `platform` | DB client, field encryption, validated config, audit log, logger | — | `audit_events`, `idempotency_keys` |
| `auth` | Login, server-side sessions, lockout, step-up | platform | `customers`, `sessions` |
| `settings` | Model per agent, model catalogue, demo controls | platform | `settings` |
| `gov-credit` | Credit-score policy: cache, daily budget, backoff, stale fallback | platform | `credit_score_cache`, `gov_api_budget` |
| `lending` | Eligibility rules, confidence, applications, referrals | gov-credit, platform | `consents`, `loan_applications` |
| `onboarding` | KYC validation, pending account applications | platform | `kyc_applications` |
| `agent` | Graph, prompts, tools, middleware | all modules | `conversations`, `callback_requests`, checkpoints |
| `mock-gov` | The simulated government service | platform | `mock_gov_*` (separate on purpose) |

Build order follows the dependency column: platform → auth → settings, gov-credit → lending, onboarding → agent → web.

```
src/
  app/                  pages + thin route handlers
  components/           ui/ (shadcn) · chat/ · settings/
  server/
    harness/  agent/  modules/<id>/  adapters/  platform/  mock-gov/
    composition.ts      wires adapters to ports
```

## 7. Agent graph

```mermaid
flowchart LR
  T([turn]) --> R{active journey<br/>or starter button?}
  R -- no --> TR[Triage LLM]
  R -- loan --> L
  R -- kyc --> K
  TR --> L & K & H[Callback] & O[Redirect]
  L[Loan agent LLM] -- assessment requested --> SU[[Step-up]] --> C[[Consent]] --> CC[Credit check] --> D[Rules + confidence]
  D -- at/above threshold --> OUT[Outcome] --> CF[[Confirm]] --> S[Submit]
  D -- below --> REF[Referral]
  K[KYC agent LLM] -- form requested --> F[[KYC form]] --> V[Validate] --> KC[[Confirm]] --> KS[Pending application]
```

- **LLM nodes:** triage, loan and KYC (three roles, model chosen per role). Everything else is code.
- **`[[ ]]` = `interrupt()`.** The UI shows a secure input and the answer goes to the server through the resume endpoint, **never through the LLM**.
- **Routing is sticky:** triage runs only when no journey is active or the topic changes; starter buttons skip it.

| Mechanism | Used for |
|---|---|
| `contextSchema` + `ToolRuntime.context` | The harness supplies the customer's identity; tools take no identity arguments |
| `interrupt(…, { responseSchema })` + `Command({ resume })` | Step-up, consent, KYC form, confirmation (validated, single-use) |
| `Command({ goto, graph: Command.PARENT })` | Specialist → deterministic steps, and hand-back to triage |
| Conditional edges | Gates: sign-in, consent, confidence threshold |
| `createAgent` middleware | Call limits, model retry, personal-data redaction, tool failure → situation label |
| Node `retryPolicy` / `timeout` / `errorHandler` | The credit-check node |
| SQLite checkpointer, `durability: "sync"` | Conversations survive restarts; no half-done steps |
| `stream()` with `messages`, `updates`, `custom` | Token streaming and progress events |

## 8. Request lifecycle

```mermaid
sequenceDiagram
  participant B as Browser
  participant H as Harness
  participant G as Graph
  B->>H: POST /api/chat (message, idempotency key)
  H->>H: origin · session · rate limit · validation · thread owner · one turn per thread
  H->>G: stream(input, context = signed-in customer)
  G-->>B: tokens · progress · interrupt(kind, interruptId)
  B->>H: POST /api/chat/resume (interruptId, payload, idempotency key)
  H->>H: interruptId pending for this session and thread? (single use)
  H->>G: resume
```

## 9. Data

```mermaid
erDiagram
  customers ||--o{ sessions : has
  customers ||--o{ conversations : owns
  customers ||--o{ consents : gives
  customers ||--o| credit_score_cache : has
  customers ||--o{ loan_applications : submits
  conversations ||--o{ audit_events : records
```

- **Ownership:** only the owning module writes its tables (§6). Others call its public functions.
- **At rest:** NIC and KYC fields are encrypted (AES-256-GCM); session tokens are stored hashed; passwords use `scrypt`.
- **Integrity:** every state-changing action has an idempotency key with a unique constraint. A decision and its audit record are written in one transaction.
- Column-level detail lives in the Drizzle schema, which is the single source.

## 10. Security architecture

| Trust boundary | Mechanism |
|---|---|
| Browser ↔ app | HTTPS + HSTS in production; strict security headers; `SameSite=Strict` cookies + origin check |
| Who the customer is | Server-side sessions (hashed tokens, rotation, revocable logout); step-up re-authentication before sensitive steps; identity never from chat |
| Repeated or replayed requests | Idempotency keys; single-use interrupt IDs bound to session and thread |
| App ↔ external APIs | TLS to allowlisted hosts; every response validated before use |
| The LLM | Least information (§11) and no authority: it can't approve, consent, resume a pause, or choose an identity |
| Secrets | Env only; the app refuses to start on invalid security config |

## 11. Failure handling

**Severity**, which sets the test obligation for every failure case in the spec:

| Level | Meaning | Obligation |
|---|---|---|
| **P0** | Could leak data, give a wrong or unauthorised outcome, duplicate an action, or bypass verification | Must never happen. An automated test blocks the merge; mutation-tested on decision boundaries |
| **P1** | A journey can't complete or visibly degrades | Must fail safe with an honest message and a next step. Automated test |
| **P2** | A fallback already exists | Tested where cheap |

**Three audiences:**

| Audience | Gets |
|---|---|
| Customer | A written template and a next step. Hard failures add a short reference code for support |
| LLM | One **situation label** (e.g. `CHECK_UNAVAILABLE_TODAY`, `REFERRED`, `INVALID_INPUT`), never error details, internal numbers, or personal data |
| Logs and audit | Full detail, personal data redacted, under the same reference |

**External dependencies degrade in one pattern:** bounded retry with backoff → cool-down → last good data (if the business rules allow it) → an honest "not available" with a human next step. Raw errors are mapped at one place: the tool middleware for the LLM, the harness for the browser.

## 12. Observability and runtime

- **Audit log:** append-only; every message, auth event, consent, tool call, decision and external call, plus the model and prompt version. **Logs:** structured JSON. Both share a correlation ID, which is also the customer's reference code.
- **Runtime:** one Node 24 instance, one SQLite file, TLS terminated at a reverse proxy. Growth path: Postgres plus a shared session store. Modules reach storage only through `platform/db`, so nothing else changes.
