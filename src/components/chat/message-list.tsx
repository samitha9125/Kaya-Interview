import { cn } from "@/lib/utils";
import type { ChatMessage } from "./turn-client";

type MessageListProps = { messages: ChatMessage[]; isBusy: boolean; progress: string | null };

// Replies arrive whole (FR-WEB-04), so the live region announces each one
// once, and the status line says what the bank is doing meanwhile.
export function MessageList({ messages, isBusy, progress }: MessageListProps) {
  return (
    <div className="flex flex-col gap-3">
      <ol aria-label="Conversation" aria-live="polite" className="flex flex-col gap-3">
        {messages.map((message) => (
          <li
            key={message.id}
            className={cn(
              "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
              message.role === "customer"
                ? "self-end bg-primary text-primary-foreground"
                : "self-start bg-muted text-foreground",
            )}
          >
            <span className="sr-only">{message.role === "customer" ? "You: " : "Bank: "}</span>
            {message.text}
          </li>
        ))}
      </ol>
      {isBusy && (
        <p role="status" className="text-sm text-muted-foreground">
          {progress ?? "The assistant is typing…"}
        </p>
      )}
    </div>
  );
}
