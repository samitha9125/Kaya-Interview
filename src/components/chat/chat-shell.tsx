"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { postJson } from "@/components/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MessageList } from "./message-list";
import { PauseCard } from "./pause-card";
import type { RestoredConversation } from "./turn-client";
import { useChat, type Starter } from "./use-chat";

type ChatShellProps = { greetingName: string | null; restored: RestoredConversation | null };

// Each starter sends a plain message and picks its journey, so triage is
// skipped (FR-AGT-01).
const STARTERS: { label: string; message: string; starter: Starter }[] = [
  { label: "Check a loan", message: "I'd like to check a loan.", starter: "loan" },
  { label: "Open an account", message: "I'd like to open an account.", starter: "kyc" },
];

export function ChatShell({ greetingName, restored }: ChatShellProps) {
  const router = useRouter();
  const chat = useChat(restored);
  const [draft, setDraft] = useState("");
  const [signOutError, setSignOutError] = useState<string | null>(null);

  async function signOut() {
    const result = await postJson("/api/auth/logout");
    if (result.ok) router.refresh();
    else setSignOutError(result.message);
  }

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    void chat.sendMessage(text);
  }

  const error = signOutError ?? (chat.pause ? null : chat.error);
  return (
    <section aria-label="Chat" className="flex w-full max-w-2xl flex-1 flex-col gap-4">
      <header className="flex items-center justify-between border-b pb-3">
        <h1 className="text-lg font-semibold">Bank Assistant</h1>
        <Button variant="ghost" onClick={() => void signOut()}>
          {greetingName ? "Sign out" : "Leave"}
        </Button>
      </header>
      <p>
        {greetingName
          ? `Hello ${greetingName}. How can I help today?`
          : "Hello. How can I help today?"}
      </p>
      {chat.messages.length === 0 && !chat.isBusy && (
        <div className="flex flex-wrap gap-2">
          {STARTERS.map((starter) => (
            <Button
              key={starter.label}
              variant="outline"
              onClick={() => void chat.sendMessage(starter.message, starter.starter)}
            >
              {starter.label}
            </Button>
          ))}
        </div>
      )}
      <MessageList messages={chat.messages} isBusy={chat.isBusy} progress={chat.progress} />
      {chat.pause && (
        <PauseCard
          pause={chat.pause}
          isBusy={chat.isBusy}
          error={chat.error}
          fieldErrors={chat.fieldErrors}
          onAnswer={chat.answer}
        />
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <form onSubmit={send} className="mt-auto flex gap-2">
        <Label htmlFor="chat-message" className="sr-only">
          Message
        </Label>
        <Input
          id="chat-message"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={1000}
          autoComplete="off"
          placeholder={chat.pause ? "Please answer the card above first." : "Type your message"}
          disabled={chat.isInputLocked}
        />
        <Button type="submit" disabled={chat.isInputLocked || !draft.trim()}>
          Send
        </Button>
      </form>
    </section>
  );
}
