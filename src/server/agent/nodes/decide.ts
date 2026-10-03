import { AIMessage } from "langchain";
import { REFERRED_TO_OFFICER } from "../templates";

// Placeholder until the lending rules are wired in (T14a): the skeleton
// proves the path, not the decision.
export function decideNode() {
  return { decision: "referred" as const, messages: [new AIMessage(REFERRED_TO_OFFICER)] };
}
