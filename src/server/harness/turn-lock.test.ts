import { describe, expect, it } from "vitest";
import { createTurnLock } from "./turn-lock";

describe("harness/turn-lock: one turn per conversation (FR-WEB-03)", () => {
  it("P1-15: a second turn while the first is running is refused", () => {
    const lock = createTurnLock();
    lock.acquire("conversation-1");

    expect(lock.acquire("conversation-1")).toBeNull();
  });

  it("P1-15: once the first turn ends, the next one may start", () => {
    const lock = createTurnLock();
    const release = lock.acquire("conversation-1");
    release?.();

    expect(lock.acquire("conversation-1")).not.toBeNull();
  });

  it("FR-WEB-03: other conversations are not held up", () => {
    const lock = createTurnLock();
    lock.acquire("conversation-1");

    expect(lock.acquire("conversation-2")).not.toBeNull();
  });

  it("FR-WEB-03: releasing twice can't free a turn that started afterwards", () => {
    const lock = createTurnLock();
    const releaseFirst = lock.acquire("conversation-1");
    releaseFirst?.();
    lock.acquire("conversation-1");

    releaseFirst?.();

    expect(lock.acquire("conversation-1")).toBeNull();
  });
});
