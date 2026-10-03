import { Command, interrupt } from "@langchain/langgraph";
import type { z } from "zod";
import {
  findCallback,
  requestCallback,
  type CallbackDeps,
  type CallbackReason,
} from "../callbacks/requests";
import { contextOf, type NodeConfig } from "../context";
import type { ConversationStateValue } from "../state";
import {
  CALLBACK_ALREADY,
  CALLBACK_CANCELLED,
  CALLBACK_REQUESTED,
  CALLBACK_REQUESTED_GUEST,
} from "../templates";
import { endWith } from "./endings";
import { CallbackFormReference, type Pause } from "./pauses";

const reasonFor = ({ journey }: ConversationStateValue): CallbackReason =>
  journey === "loan" || journey === "kyc" ? journey : "general";

// A "human" journey lasts one turn; the specialist journeys stay.
const journeyAfter = ({ journey }: ConversationStateValue) =>
  journey === "human" ? { journey: null } : {};

// FR-AGT-14: a signed-in customer's request is made from their record at
// once; a guest is asked for a name and number on a card. Either way it
// is one request per conversation and reason.
export function callbackNode(callbacks: CallbackDeps) {
  return (state: ConversationStateValue, config: NodeConfig) => {
    const { conversationId, correlationId, customerId } = contextOf(config);
    const reason = reasonFor(state);
    const update = journeyAfter(state);
    if (findCallback(callbacks.db, conversationId, reason)) {
      return endWith(state, "HANDED_TO_PERSON", CALLBACK_ALREADY, update);
    }
    if (!customerId) return new Command({ goto: "callback_form", update });
    requestCallback({ conversationId, correlationId, reason, caller: { customerId } }, callbacks);
    return endWith(state, "HANDED_TO_PERSON", CALLBACK_REQUESTED, update);
  };
}

// The card posts the guest's details to the server, which stores them
// encrypted and resumes with the request's ID only (TD11).
export function callbackFormNode(state: ConversationStateValue) {
  const answer = interrupt<Pause, z.infer<typeof CallbackFormReference>>(
    { kind: "callback_form", reason: reasonFor(state) },
    { responseSchema: CallbackFormReference },
  );
  if ("declined" in answer) return endWith(state, "CALLBACK_NOT_REQUESTED", CALLBACK_CANCELLED);
  return endWith(state, "HANDED_TO_PERSON", CALLBACK_REQUESTED_GUEST);
}
