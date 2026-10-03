// The agent's own numbers. The call limits live with their counting in
// limits.ts (FR-AGT-11).
export const AGENT_POLICY = {
  // FR-AGT-01: enough of the conversation to read a short answer such as
  // "yes please".
  triageRecentMessages: 6,
  // FR-AGT-12: two retries for triage; the specialists' retries start at
  // about 1 s, then 2 s, before giving up.
  triageAttempts: 3,
  modelRetryInitialDelayMs: 1_000,
  // The credit-check node: a busy database is worth two more tries, and
  // two 5-second attempts with the 1-second pause between them fit easily
  // in the timeout.
  creditCheckAttempts: 3,
  creditCheckTimeoutMs: 20_000,
} as const;
