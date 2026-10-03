export const AGENT_ROLES = ["triage", "loan", "kyc"] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

// FR-SET-01, TD6: cheap defaults, each tool-capable with zero-data-retention
// endpoints. The bank can change any of them in Settings.
export const DEFAULT_MODELS: Record<AgentRole, string> = {
  triage: "google/gemini-3.1-flash-lite",
  loan: "z-ai/glm-5.3-flash",
  kyc: "openai/gpt-5.6-luna",
};
