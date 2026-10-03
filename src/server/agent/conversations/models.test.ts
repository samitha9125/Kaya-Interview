import { describe, expect, it } from "vitest";
import type { Session } from "@/server/modules/auth";
import { chooseModel, currentModels, DEFAULT_MODELS } from "@/server/modules/settings";
import { createAuditLog } from "@/server/platform/audit";
import { createTestDatabase } from "@/test/database";
import { fixedClock, sequentialIds } from "@/test/fakes";
import { findOwnedConversation, startConversation } from "./ownership";

const customer: Session = { id: "session-a", customerId: "customer-a", stepUpAt: null };
const NEW_MODEL = "anthropic/claude-haiku";

describe("agent/conversations: models are fixed when a conversation starts", () => {
  it("FR-SET-01, P2-05: a model change applies to new conversations only", async () => {
    const { db } = createTestDatabase();
    const clock = fixedClock();
    const deps = { db, clock, ids: sequentialIds("conversation") };
    const before = startConversation(customer, currentModels(db), deps);
    await chooseModel(
      { role: "loan", modelId: NEW_MODEL, actor: "operator", correlationId: "corr-1" },
      {
        db,
        clock,
        audit: createAuditLog({ clock, ids: sequentialIds("audit") }),
        catalog: {
          listToolModels: async () => ({
            ok: true,
            models: [
              {
                id: NEW_MODEL,
                name: NEW_MODEL,
                contextLength: 200_000,
                inputMicroUsdPerMTok: 1_000_000,
                outputMicroUsdPerMTok: 5_000_000,
              },
            ],
          }),
        },
      },
    );

    const after = startConversation(customer, currentModels(db), deps);

    expect(findOwnedConversation(before, customer, deps)?.models.loan).toBe(DEFAULT_MODELS.loan);
    expect(findOwnedConversation(after, customer, deps)?.models.loan).toBe(NEW_MODEL);
  });
});
