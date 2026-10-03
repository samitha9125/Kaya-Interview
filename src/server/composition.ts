import "server-only";
import { LOGIN_RATE_LIMIT } from "@/server/modules/auth";
import { createAuditLog } from "@/server/platform/audit";
import { systemClock } from "@/server/platform/clock";
import { getConfig, type AppConfig } from "@/server/platform/config";
import { openDatabase } from "@/server/platform/db";
import { createIdempotency } from "@/server/platform/idempotency";
import { randomIds } from "@/server/platform/ids";
import { logger } from "@/server/platform/logger";
import { createRateLimiter } from "@/server/platform/rate-limit";
import { createTurnLock } from "@/server/harness/turn-lock";

// The composition root: the only file that knows which adapters implement
// which ports (ARCHITECTURE §5). Each port is wired here when it gets its
// first adapter.

// FR-WEB-02: 20 chat requests per IP per minute.
const CHAT_RATE_LIMIT = { limit: 20, windowMs: 60_000 } as const;

function createApp(config: AppConfig) {
  const { db } = openDatabase(config.DATABASE_PATH);
  const clock = systemClock;
  const ids = randomIds;
  return {
    config,
    db,
    clock,
    ids,
    logger,
    audit: createAuditLog({ clock, ids }),
    idempotency: createIdempotency({ db, clock }),
    loginLimiter: createRateLimiter({ ...LOGIN_RATE_LIMIT, clock }),
    chatLimiter: createRateLimiter({ ...CHAT_RATE_LIMIT, clock }),
    turnLock: createTurnLock(),
  };
}

export type App = ReturnType<typeof createApp>;

// One instance per server process. Next.js can load this module once per
// route bundle (and again on every dev reload), but the turn lock and the
// rate limits only work if every route shares them.
const holder = globalThis as typeof globalThis & { bankAssistantApp?: App };

export function app(): App {
  holder.bankAssistantApp ??= createApp(getConfig());
  return holder.bankAssistantApp;
}
