import { AIMessage, HumanMessage, ToolMessage, type BaseMessage } from "langchain";
import type { SituationLabel } from "@/server/agent/labels";
import { fromBank } from "@/server/agent/nodes/endings";
import {
  ASSESSMENT_EXPIRED,
  CHECK_UNAVAILABLE_TODAY,
  eligible,
  notEligible,
  openApplication,
  REFERRED_TO_OFFICER,
} from "@/server/agent/templates";
import { ASSESSMENT_CALL } from "@/test/graph";
import { TERMS } from "@/test/lending-setup";

type Decision = "eligible" | "not_eligible" | "referred" | null;

// The endings a customer can question in chat, each with the decision it
// leaves in state and the template the customer was shown.
const ENDINGS = {
  ELIGIBLE: { decision: "eligible", shown: eligible(TERMS) },
  NOT_ELIGIBLE: { decision: "not_eligible", shown: notEligible("credit_profile") },
  REFERRED: { decision: "referred", shown: REFERRED_TO_OFFICER },
  APPLICATION_ALREADY_OPEN: { decision: null, shown: openApplication("referred") },
  RESULT_EXPIRED: { decision: "eligible", shown: ASSESSMENT_EXPIRED },
  CHECK_UNAVAILABLE_TODAY: { decision: null, shown: CHECK_UNAVAILABLE_TODAY },
} satisfies Partial<Record<SituationLabel, { decision: Decision; shown: string }>>;

export type QuestionedEnding = keyof typeof ENDINGS;

// The conversation as the graph leaves it after that ending: the loan
// agent's request_assessment call, the label on it, and the bank's
// template. The case's message is then the customer's follow-up.
export function afterOutcome(label: QuestionedEnding): {
  history: BaseMessage[];
  decision: Decision;
} {
  const { decision, shown } = ENDINGS[label];
  return {
    decision,
    history: [
      new HumanMessage("I'd like 500,000 over 36 months."),
      new AIMessage({ content: "", tool_calls: [{ ...ASSESSMENT_CALL, type: "tool_call" }] }),
      new ToolMessage({ tool_call_id: ASSESSMENT_CALL.id, content: label }),
      fromBank(shown),
    ],
  };
}
