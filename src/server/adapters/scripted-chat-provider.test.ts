import { AIMessage, HumanMessage, ToolMessage } from "langchain";
import { describe, expect, it } from "vitest";
import { ASK_FOR_TERMS, ScriptedChatProvider, TERMS_REFUSED } from "./scripted-chat-provider";

async function replyTo(...messages: (HumanMessage | AIMessage | ToolMessage)[]) {
  const model = new ScriptedChatProvider().chatModel();
  return (await model.invoke(messages)) as AIMessage;
}

describe("adapters/scripted-chat-provider: a rule-played loan agent for tests (TD25)", () => {
  it("TD25: without an amount and a term, it asks for them", async () => {
    const reply = await replyTo(new HumanMessage("I'd like to check a loan."));

    expect(reply.text).toBe(ASK_FOR_TERMS);
    expect(reply.tool_calls).toEqual([]);
  });

  it.each([
    { text: "500,000 over 36 months", amountLkr: 500_000, termMonths: 36 },
    { text: "I need 2000000 for 60 months please", amountLkr: 2_000_000, termMonths: 60 },
  ])("TD25: '$text' → request_assessment($amountLkr, $termMonths)", async (example) => {
    const reply = await replyTo(new HumanMessage(example.text));

    expect(reply.tool_calls).toMatchObject([
      {
        name: "request_assessment",
        args: { amountLkr: example.amountLkr, termMonths: example.termMonths },
      },
    ]);
  });

  it("FR-AGT-11: after a refused tool call it answers in words instead of calling again", async () => {
    const reply = await replyTo(
      new HumanMessage("50,000,000 over 36 months"),
      new AIMessage({
        content: "",
        tool_calls: [{ id: "c1", name: "request_assessment", args: {} }],
      }),
      new ToolMessage({ content: "INVALID_INPUT", tool_call_id: "c1" }),
    );

    expect(reply.text).toBe(TERMS_REFUSED);
  });
});
