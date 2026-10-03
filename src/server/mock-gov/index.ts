import "server-only";
import { setTimeout as sleep } from "node:timers/promises";
import { systemClock } from "@/server/platform/clock";
import { getConfig } from "@/server/platform/config";
import { openDatabase } from "@/server/platform/db";
import { creditScore, resetDailyLimit, setFailureMode, type MockGovDeps } from "./service";

export { FAILURE_MODES, registerCitizen, type FailureMode } from "./service";

// The mock stands in for an external service, so it wires itself instead
// of going through our composition root, with its own connection.
const holder = globalThis as typeof globalThis & { mockGovDeps?: MockGovDeps };

function deps(): MockGovDeps {
  const config = getConfig();
  holder.mockGovDeps ??= {
    db: openDatabase(config.DATABASE_PATH).db,
    clock: systemClock,
    sleep: (ms) => sleep(ms),
    isDemoMode: config.DEMO_MODE,
  };
  return holder.mockGovDeps;
}

export const creditScoreRoute = (request: Request) => creditScore(request, deps());
export const resetRoute = (request: Request) => resetDailyLimit(request, deps());
export const failureModeRoute = (request: Request) => setFailureMode(request, deps());
