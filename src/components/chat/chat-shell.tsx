"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
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
  { label: "Talk to a person", message: "I'd like to talk to a person.", starter: "human" },
];

// The gap kept above a card when it's scrolled into view.
const CARD_GAP_PX = 16;

export function ChatShell({ greetingName, restored }: ChatShellProps) {
  const chat = useChat(restored);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Follows the newest message, progress line or card. A card is scrolled to
  // its top, so a tall form opens at its first field rather than its end.
  // Only the conversation box scrolls (scrollIntoView would move the page
  // too); it's positioned, so the card's offsetTop is measured from it.
  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    const card = cardRef.current;
    box.scrollTo({ top: card ? card.offsetTop - CARD_GAP_PX : box.scrollHeight });
  }, [chat.messages.length, chat.progress, chat.isBusy, chat.pause]);

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    void chat.sendMessage(text);
  }

  const error = chat.pause ? null : chat.error;
  return (
    <section aria-label="Chat" className="flex min-h-0 w-full max-w-2xl flex-1 flex-col">
      <h1 className="sr-only">Chat</h1>
      <div
        ref={scrollRef}
        className="no-scrollbar relative flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-4 motion-safe:scroll-smooth"
      >
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
          <div ref={cardRef}>
            <PauseCard
              pause={chat.pause}
              isBusy={chat.isBusy}
              error={chat.error}
              fieldErrors={chat.fieldErrors}
              onAnswer={chat.answer}
            />
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="pt-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <form onSubmit={send} className="flex gap-2 border-t py-4">
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
