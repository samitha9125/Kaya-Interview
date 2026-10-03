"use client";

import { useState } from "react";
import { sendTurn, type ChatMessage, type Pause, type RestoredConversation } from "./turn-client";

export type Answer =
  | { kind: "step_up"; password: string }
  | { kind: "consent"; agree: boolean }
  | { kind: "confirm"; confirm: boolean }
  | { kind: "kyc_form"; form: Record<string, string> | null }
  | { kind: "kyc_confirm"; confirm: boolean }
  | { kind: "callback_form"; contact: Record<string, string> | null };

export type Starter = "loan" | "kyc" | "human";

// The chat's state, driven by a turn's events. Input stays locked while a
// turn runs and while a card waits for its answer (FR-WEB-03).
export function useChat(restored: RestoredConversation | null) {
  const [conversationId, setConversationId] = useState(restored?.id ?? null);
  const [messages, setMessages] = useState<ChatMessage[]>(restored?.messages ?? []);
  const [pause, setPause] = useState<Pause | null>(restored?.pause ?? null);
  const [isBusy, setIsBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // Counts finished turns, so the demo panel knows when to read again.
  const [turnsDone, setTurnsDone] = useState(0);

  async function runTurn(url: string, body: Record<string, unknown>, onRefused: () => void) {
    setIsBusy(true);
    setError(null);
    setFieldErrors({});
    await sendTurn(url, body, (event) => {
      switch (event.type) {
        case "typing":
          // The server took the turn, so any card it answered is gone.
          return setPause(null);
        case "progress":
          return setProgress(event.text);
        case "message":
          return setMessages((list) => [
            ...list,
            { id: event.id, role: "assistant", text: event.text },
          ]);
        case "interrupt":
          return setPause(event.pause);
        case "error":
          if (event.refused) onRefused();
          setFieldErrors(event.fields ?? {});
          return setError(event.message);
        case "done":
          return setConversationId(event.conversationId);
      }
    });
    setProgress(null);
    setIsBusy(false);
    setTurnsDone((count) => count + 1);
  }

  function sendMessage(text: string, starter?: Starter) {
    const id = crypto.randomUUID();
    setMessages((list) => [...list, { id, role: "customer", text }]);
    // A refused message never reached the conversation, so it's taken back.
    const takeBack = () => setMessages((list) => list.filter((message) => message.id !== id));
    // A new conversation has no ID yet; JSON leaves the field out.
    return runTurn(
      "/api/chat",
      { message: text, conversationId: conversationId ?? undefined, starter },
      takeBack,
    );
  }

  function answer(reply: Answer) {
    if (!pause || !conversationId) return Promise.resolve();
    const body = { conversationId, interruptId: pause.interruptId, answer: reply };
    return runTurn("/api/chat/resume", body, () => {});
  }

  const isInputLocked = isBusy || pause !== null;
  return {
    conversationId,
    turnsDone,
    messages,
    pause,
    isBusy,
    isInputLocked,
    progress,
    error,
    fieldErrors,
    sendMessage,
    answer,
  };
}
