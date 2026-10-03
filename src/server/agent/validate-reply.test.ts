import { AIMessage, fakeModel } from "langchain";
import { describe, expect, it } from "vitest";
import { buildTestGraph, pendingInterrupts, sendMessage } from "@/test/graph";
import { runConfig } from "./graph";
import { claimsDecision } from "./nodes/validate-reply";
import { REQUEST_ASSESSMENT } from "./nodes/loan-agent";
import { resumeInterrupt } from "./resume";
import { NO_DECISION_IN_CHAT } from "./templates";

describe("agent/validate-reply: decision wording", () => {
  it.each([
    { text: "Good news, you're approved!", expected: true },
    { text: "I'd approve this straight away.", expected: true },
    { text: "You are eligible for 500,000.", expected: true },
    { text: "Sadly you're not eligible.", expected: true },
    { text: "We've declined it.", expected: true },
    { text: "I'd decline this one.", expected: true },
    { text: "Your request was rejected.", expected: true },
    { text: "They'd reject it.", expected: true },
    { text: "I've referred you to an officer.", expected: true },
    { text: "APPROVED", expected: true },
    { text: "I can run an eligibility check for you.", expected: false },
    { text: "Loans run 6 to 60 months at 14% a year.", expected: false },
  ])("FR-AGT-07: '$text' → claims a decision: $expected", ({ text, expected }) => {
    expect(claimsDecision(text)).toBe(expected);
  });
});

describe("agent graph: replies are checked before display", () => {
  it("P0-05: a model claiming approval is replaced; the customer never sees the claim", async () => {
    const graph = buildTestGraph(
      fakeModel().respond(new AIMessage("Great news, you're approved!")),
    );

    const result = await sendMessage(graph, "t1", "Am I approved? I really need this.");

    expect(result.messages.at(-1)?.text).toBe(NO_DECISION_IN_CHAT);
    expect(result.messages.map((message) => message.text)).not.toContain(
      "Great news, you're approved!",
    );
  });

  it("FR-AGT-07: the replacement keeps the reply's place, so history has one reply, not two", async () => {
    const graph = buildTestGraph(fakeModel().respond(new AIMessage("You're approved.")));

    const result = await sendMessage(graph, "t1", "Approve me");

    expect(result.messages).toHaveLength(2);
  });

  it("FR-AGT-07: once a decision exists in state, the reply may talk about it", async () => {
    const model = fakeModel()
      .respondWithTools([{ name: REQUEST_ASSESSMENT, args: {} }])
      .respond(new AIMessage("Your case was referred to an officer, who will call you."));
    const graph = buildTestGraph(model);
    await sendMessage(graph, "t1", "Check my loan");
    const [consent] = await pendingInterrupts(graph, "t1");
    await resumeInterrupt(graph, {
      threadId: "t1",
      interruptId: consent!.id!,
      reference: { consentId: "consent-1" },
    });

    const result = await sendMessage(graph, "t1", "What happens next?");

    expect((await graph.getState(runConfig("t1"))).values.decision).toBe("referred");
    expect(result.messages.at(-1)?.text).toBe(
      "Your case was referred to an officer, who will call you.",
    );
  });
});
