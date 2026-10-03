import "server-only";
import { setTimeout as sleep } from "node:timers/promises";
import { HttpGovBureau } from "@/server/adapters/http-gov-bureau";
import { HttpMockBureauAdmin } from "@/server/adapters/http-mock-bureau-admin";
import { OpenRouterCatalog } from "@/server/adapters/openrouter-catalog";
import { OpenRouterProvider } from "@/server/adapters/openrouter-provider";
import { ScriptedChatProvider } from "@/server/adapters/scripted-chat-provider";
import { StaticModelCatalog } from "@/server/adapters/static-model-catalog";
import { createCheckpointer } from "@/server/agent/checkpointer";
import { buildConversationGraph } from "@/server/agent/graph";
import {
  findBankRecord,
  findCustomerNic,
  hasCustomerWithNic,
  isStepUpFreshFor,
  LOGIN_RATE_LIMIT,
} from "@/server/modules/auth";
import type { GovCreditDeps } from "@/server/modules/gov-credit";
import type { LendingDeps } from "@/server/modules/lending";
import type { OnboardingDeps } from "@/server/modules/onboarding";
import type { SettingsDeps } from "@/server/modules/settings";
import { createAuditLog } from "@/server/platform/audit";
import { systemClock } from "@/server/platform/clock";
import { getConfig, type AppConfig } from "@/server/platform/config";
import { deriveSecret } from "@/server/platform/crypto";
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
  // B20, TD27: the bank is hypothetical, so the government API is always the
  // built-in mock, reached over HTTP on this server like an external service.
  const govApiBaseUrl = `http://localhost:${config.PORT}/api/mock-gov`;
  const clock = systemClock;
  const ids = randomIds;
  const audit = createAuditLog({ clock, ids });
  const credit: GovCreditDeps = {
    db,
    audit,
    clock,
    bureau: new HttpGovBureau({
      baseUrl: govApiBaseUrl,
      apiKey: deriveSecret(config.APP_ENCRYPTION_KEY, "gov-api-key"),
      clock,
    }),
    cacheTtlDays: config.CREDIT_CACHE_TTL_DAYS,
    loadNic: (customerId) => findCustomerNic(db, customerId, config.APP_ENCRYPTION_KEY),
    sleep: (ms) => sleep(ms),
    random: Math.random,
  };
  const isScripted = config.E2E_SCRIPTED_MODEL;
  const settings: SettingsDeps = {
    db,
    audit,
    clock,
    catalog: isScripted ? new StaticModelCatalog() : new OpenRouterCatalog(),
  };
  const lending: LendingDeps = {
    db,
    audit,
    clock,
    ids,
    credit,
    thresholdBp: config.AUTO_DECISION_THRESHOLD,
    loadBankRecord: (customerId) => findBankRecord(db, customerId),
  };
  const onboarding: OnboardingDeps = {
    db,
    audit,
    clock,
    ids,
    encryptionKey: config.APP_ENCRYPTION_KEY,
    isExistingCustomerNic: (nic) => hasCustomerWithNic(db, nic, config.APP_ENCRYPTION_KEY),
  };
  const callbacks = { db, audit, clock, ids, encryptionKey: config.APP_ENCRYPTION_KEY };
  const models = isScripted
    ? new ScriptedChatProvider()
    : new OpenRouterProvider({ apiKey: config.OPENROUTER_API_KEY });
  if (isScripted) {
    logger.warn("the scripted chat model is in use; replies are rule-played (TD25)");
  }
  const checkpointer = createCheckpointer(sqlite);
  const graph = buildConversationGraph({
    models,
    lending,
    onboarding,
    callbacks,
    isStepUpFresh: (sessionId) => isStepUpFreshFor(sessionId, { db, clock }),
    checkpointer,
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
    onboarding,
    callbacks,
    models,
    graph,
    checkpointer,
    mockBureauAdmin: new HttpMockBureauAdmin(govApiBaseUrl),
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
