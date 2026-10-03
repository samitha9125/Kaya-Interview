import { beforeEach, describe, expect, it } from "vitest";
import type { DatabaseHandle } from "@/server/platform/db";
import { createTestDatabase } from "@/test/database";
import { movableClock } from "@/test/fakes";
import {
  creditScore,
  registerCitizen,
  resetDailyLimit,
  setFailureMode,
  type FailureMode,
  type MockGovDeps,
} from "./service";

// Made-up NICs. secret-scan:ignore
const SCORED = "199012345678";
const NO_HISTORY = "901234567V";

let handle: DatabaseHandle;
let deps: MockGovDeps;
let slept: number[];
let advance: (ms: number) => void;

beforeEach(() => {
  handle = createTestDatabase();
  slept = [];
  const time = movableClock("2026-10-03T10:00:00.000Z"); // 15:30 in Colombo
  advance = time.advance;
  deps = {
    db: handle.db,
    clock: time.clock,
    isDemoMode: true,
    sleep: async (ms) => void slept.push(ms),
  };
  registerCitizen(handle.db, SCORED, 742);
  registerCitizen(handle.db, NO_HISTORY, null);
});

const post = (body: unknown, ip = "203.0.113.7") =>
  new Request("http://localhost/api/mock-gov/credit-score", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });

const ask = (nic = SCORED, ip?: string) => creditScore(post({ nic }, ip), deps);

async function askTimes(times: number) {
  for (let made = 0; made < times; made += 1) await ask();
}

async function useMode(mode: FailureMode) {
  await setFailureMode(post({ mode }), deps);
}

describe("mock-gov: credit score (FR-MOCK-01)", () => {
  it("FR-MOCK-01: a known citizen → 200 with the score and nothing else", async () => {
    const response = await ask();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ score: 742 });
  });

  it.each([
    { case: "a citizen with no credit history", nic: NO_HISTORY },
    { case: "an unknown NIC", nic: "200001234567" },
  ])("FR-MOCK-01: $case → 404 no credit history", async ({ nic }) => {
    const response = await ask(nic);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "no_credit_history" });
  });

  it("FR-MOCK-01: the NIC is matched however it's spaced or cased", async () => {
    expect(await (await ask("901234567v")).json()).toEqual({ error: "no_credit_history" });
    expect((await ask("1990 1234 5678")).status).toBe(200);
  });

  it("FR-PLAT-02: no NIC is stored in plain text, even in the mock's tables", () => {
    const stored = handle.sqlite.prepare("SELECT nic_hash FROM mock_gov_citizens").pluck().all();

    expect(JSON.stringify(stored)).not.toContain(SCORED);
  });

  it("FR-MOCK-01: a malformed request → 400", async () => {
    expect((await creditScore(post({ id: SCORED }), deps)).status).toBe(400);
  });
});

describe("mock-gov: per-IP daily limit (FR-MOCK-02)", () => {
  it.each([
    { call: 5, status: 200 },
    { call: 6, status: 429 },
  ])("FR-MOCK-02: call $call of the day from one IP → $status", async ({ call, status }) => {
    await askTimes(call - 1);

    expect((await ask()).status).toBe(status);
  });

  it("FR-MOCK-02: the 6th call says to retry at Sri Lanka midnight", async () => {
    await askTimes(5);

    const response = await ask();

    // 15:30 in Colombo → 8.5 hours to midnight.
    expect(response.headers.get("retry-after")).toBe(String(8.5 * 60 * 60));
  });

  it("FR-MOCK-02: another IP has its own allowance", async () => {
    await askTimes(5);

    expect((await ask(SCORED, "198.51.100.2")).status).toBe(200);
  });

  it("A5: the count resets at midnight Sri Lanka time", async () => {
    await askTimes(5);
    advance(8.5 * 60 * 60 * 1_000);

    expect((await ask()).status).toBe(200);
  });
});

describe("mock-gov: failure modes (FR-MOCK-03)", () => {
  it.each([
    { mode: "error" as const, status: 500 },
    { mode: "down" as const, status: 503 },
    { mode: "rate_limited" as const, status: 429 },
  ])("FR-MOCK-03: mode $mode → $status", async ({ mode, status }) => {
    await useMode(mode);

    expect((await ask()).status).toBe(status);
  });

  it("FR-MOCK-03: rate_limited sends a Retry-After of one hour", async () => {
    await useMode("rate_limited");

    expect((await ask()).headers.get("retry-after")).toBe("3600");
  });

  it("FR-MOCK-03: slow waits 6 seconds, beyond our 5-second timeout, then answers", async () => {
    await useMode("slow");

    const response = await ask();

    expect(slept).toEqual([6_000]);
    expect(response.status).toBe(200);
  });

  it("FR-MOCK-03: back to normal answers normally", async () => {
    await useMode("down");
    await useMode("normal");

    expect((await ask()).status).toBe(200);
  });

  it("FR-MOCK-03: a service that is down doesn't count the call", async () => {
    await useMode("down");
    await askTimes(5);
    await useMode("normal");

    expect((await ask()).status).toBe(200);
  });

  it("FR-MOCK-03: an unknown mode is refused", async () => {
    expect((await setFailureMode(post({ mode: "chaos" }), deps)).status).toBe(400);
  });
});

describe("mock-gov: demo-only admin (FR-MOCK-04)", () => {
  it("FR-MOCK-04: in demo mode, a reset gives today's allowance back", async () => {
    await askTimes(6);

    resetDailyLimit(post({}), deps);

    expect((await ask()).status).toBe(200);
  });

  it.each([
    { control: "reset", call: () => Promise.resolve(resetDailyLimit(post({}), deps)) },
    { control: "failure mode", call: () => setFailureMode(post({ mode: "down" }), deps) },
  ])("FR-MOCK-04: with demo mode off, $control → 404 and nothing changes", async ({ call }) => {
    await askTimes(6);
    deps.isDemoMode = false;

    const response = await call();

    expect(response.status).toBe(404);
    expect((await ask()).status).toBe(429);
  });
});
