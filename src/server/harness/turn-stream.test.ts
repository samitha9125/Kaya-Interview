import { Command } from "@langchain/langgraph";
import { HumanMessage, fakeModel } from "langchain";
import { describe, expect, it } from "vitest";
import { readTranscript } from "@/server/agent/transcript";
import { CHECKING_CREDIT, eligible, NEEDS_SIGN_IN } from "@/server/agent/templates";
import { createLogger } from "@/server/platform/logger";
import { aScore, scriptedBureau } from "@/test/fake-bureau";
import {
  ASSESSMENT_CALL,
  buildTestGraph,
  checkedResume,
  consentFor,
  pendingInterrupts,
  sendMessage,
  testContext,
} from "@/test/graph";
import { lendingTestSetup, TERMS } from "@/test/lending-setup";
import { readEvents } from "@/test/sse";
import { streamTurn, type TurnRun } from "./turn-stream";

const quietLogger = createLogger({ write: () => {} });

function aRun(overrides: Partial<TurnRun> & Pick<TurnRun, "graph" | "input">): TurnRun {
  return {
    context: testContext("t1"),
    logger: quietLogger,
    viewPause: ({ interruptId, pause }) => ({ interruptId, ...pause }),
    release: () => {},
    ...overrides,
  };
}

// A conversation paused at consent, with the check set to find a good score.
async function pausedAtConsent() {
  const lending = lendingTestSetup(scriptedBureau([aScore(800)]).bureau).deps;
  const graph = buildTestGraph(fakeModel().respondWithTools([ASSESSMENT_CALL]), { lending });
  await sendMessage(graph, "t1", "Check my loan");
  const [pending] = await pendingInterrupts(graph, "t1");
  const resume = await checkedResume(graph, "t1", pending!.id!, {
    consentId: consentFor(lending, "t1"),
  });
  return { graph, resume };
}

describe("harness/turn-stream: what the browser hears (FR-WEB-04)", () => {
  it("FR-WEB-04: typing, then progress, then the whole reply, then the card, then done", async () => {
    const { graph, resume } = await pausedAtConsent();

    const response = streamTurn(aRun({ graph, input: new Command({ resume }) }));

    const events = await readEvents(response);
    expect(response.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
    expect(events.map((event) => event.type)).toEqual([
      "typing",
      "progress",
      "message",
      "interrupt",
      "done",
    ]);
    expect(events[1]?.data).toEqual({ text: CHECKING_CREDIT });
    expect(events[2]?.data).toMatchObject({ text: eligible(TERMS) });
    expect(events[3]?.data).toMatchObject({ pause: { kind: "confirm", ...TERMS } });
    expect(events[4]?.data).toEqual({ conversationId: "t1" });
  });

  it("FR-AGT-08: the customer's own message and tool traffic are not sent back", async () => {
    const graph = buildTestGraph(fakeModel().respondWithTools([ASSESSMENT_CALL]));
    const input = { messages: [new HumanMessage("Check my loan")], journey: "loan" as const };

    const response = streamTurn(
      aRun({ graph, input, context: testContext("t1", { customerId: null }) }),
    );

    const messages = (await readEvents(response)).filter((event) => event.type === "message");
    expect(messages.map((event) => event.data.text)).toEqual([NEEDS_SIGN_IN]);
  });

  it("FR-WEB-05: a run that fails sends the template and a reference, never the raw error", async () => {
    const graph = buildTestGraph(fakeModel().respondWithTools([ASSESSMENT_CALL]));
    const input = { messages: [new HumanMessage("Check my loan")], journey: "loan" as const };
    const brokenContext = { ...testContext("t1"), customerId: 42 } as never;

    const response = streamTurn(aRun({ graph, input, context: brokenContext }));

    const events = await readEvents(response);
    const error = events.find((event) => event.type === "error");
    expect(error?.data.message).toMatch(/^Something went wrong on our side\. Reference: \w{4}\./);
    expect(JSON.stringify(events)).not.toMatch(/customerId|ZodError|expected/i);
    expect(events.at(-1)?.type).toBe("done");
  });

  it("FR-WEB-03: the turn lock is released when the run ends, even after a failure", async () => {
    const graph = buildTestGraph(fakeModel());
    let releases = 0;

    await streamTurn(
      aRun({
        graph,
        input: { messages: [new HumanMessage("Hi")], journey: "loan" as const },
        context: { ...testContext("t1"), customerId: 42 } as never,
        release: () => releases++,
      }),
    ).text();

    expect(releases).toBe(1);
  });

  it("P1-11: a dropped connection doesn't stop the run; its result is there on reload", async () => {
    const { graph, resume } = await pausedAtConsent();
    let finished = () => {};
    const runEnded = new Promise<void>((resolve) => (finished = resolve));
    const response = streamTurn(aRun({ graph, input: new Command({ resume }), release: finished }));

    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel();
    await runEnded;

    const transcript = await readTranscript(graph, "t1");
    expect(transcript.messages.at(-1)?.text).toBe(eligible(TERMS));
    expect(transcript.pause?.pause.kind).toBe("confirm");
  });
});
