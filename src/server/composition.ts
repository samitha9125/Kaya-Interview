import "server-only";
import { setTimeout as sleep } from "node:timers/promises";
import { HttpGovBureau } from "@/server/adapters/http-gov-bureau";
import { OpenRouterCatalog } from "@/server/adapters/openrouter-catalog";
import { OpenRouterProvider } from "@/server/adapters/openrouter-provider";
import { createCheckpointer } from "@/server/agent/checkpointer";
import { buildConversationGraph } from "@/server/agent/graph";
import {
  findBankRecord,
  findCustomerNic,
  isStepUpFreshFor,
  LOGIN_RATE_LIMIT,
} from "@/server/modules/auth";
import type { GovCreditDeps } from "@/server/modules/gov-credit";
import type { LendingDeps } from "@/server/modules/lending";
import type { SettingsDeps } from "@/server/modules/settings";
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
  const { db, sqlite } = openDatabase(config.DATABASE_PATH);
  const clock = systemClock;
  const ids = randomIds;
  const audit = createAuditLog({ clock, ids });
  const credit: GovCreditDeps = {
    db,
    audit,
    clock,
    bureau: new HttpGovBureau({ baseUrl: config.GOV_API_BASE_URL, clock }),
    cacheTtlDays: config.CREDIT_CACHE_TTL_DAYS,
    loadNic: (customerId) => findCustomerNic(db, customerId, config.APP_ENCRYPTION_KEY),
    sleep: (ms) => sleep(ms),
    random: Math.random,
  };
  const settings: SettingsDeps = { db, audit, clock, catalog: new OpenRouterCatalog() };
  const lending: LendingDeps = {
    db,
    audit,
    clock,
    ids,
    credit,
    thresholdBp: config.AUTO_DECISION_THRESHOLD,
    loadBankRecord: (customerId) => findBankRecord(db, customerId),
  };
  const models = new OpenRouterProvider({ apiKey: config.OPENROUTER_API_KEY });
  const graph = buildConversationGraph({
    models,
    lending,
    isStepUpFresh: (sessionId) => isStepUpFreshFor(sessionId, { db, clock }),
    checkpointer: createCheckpointer(sqlite),
  });
  return {
    config,
    db,
    clock,
    ids,
    logger,
    audit,
    credit,
    settings,
    lending,
    models,
    graph,
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
