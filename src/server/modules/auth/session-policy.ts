import type { SessionPolicy } from "./config";

type SessionTimes = { createdAt: Date; lastSeenAt: Date };

export function isSessionActive(session: SessionTimes, now: Date, policy: SessionPolicy): boolean {
  const idleMs = now.getTime() - session.lastSeenAt.getTime();
  const ageMs = now.getTime() - session.createdAt.getTime();
  return idleMs < policy.idleMs && ageMs < policy.absoluteMs;
}

export function isStepUpFresh(stepUpAt: Date | null, now: Date, validMs: number): boolean {
  return stepUpAt !== null && now.getTime() - stepUpAt.getTime() < validMs;
}
