import { AIMessage, HumanMessage, ToolMessage } from "langchain";
import { describe, expect, it } from "vitest";
import type { ConversationStateValue } from "../state";
import { labelled } from "./endings";

const call = (id: string) =>
  new AIMessage({ content: "", tool_calls: [{ id, name: "request_assessment", args: {} }] });
const stateWith = (...messages: ConversationStateValue["messages"]) =>
  ({ messages }) as ConversationStateValue;

describe("agent/endings: which tool result gets the label (FR-AGT-08)", () => {
  it("FR-AGT-08: this turn's tool result is swapped for the label, by ID", () => {
    const result = new ToolMessage({
      id: "t1",
      content: "Assessment requested",
      tool_call_id: "c1",
    });

    const [swapped] = labelled(
      stateWith(new HumanMessage("Check"), call("c1"), result),
      "REFERRED",
    );

    expect(swapped).toMatchObject({ id: "t1", tool_call_id: "c1", content: "REFERRED" });
  });

  it("FR-AGT-08: an earlier turn's result keeps its own label", () => {
    const earlier = new ToolMessage({ id: "t1", content: "SUBMITTED", tool_call_id: "c1" });

    const swapped = labelled(
      stateWith(new HumanMessage("Check"), call("c1"), earlier, new HumanMessage("Call me")),
      "HANDED_TO_PERSON",
    );

    expect(swapped).toEqual([]);
  });
});
