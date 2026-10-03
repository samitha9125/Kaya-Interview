"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/components/api";
import { Button } from "@/components/ui/button";

type ChatShellProps = { greetingName: string | null };

export function ChatShell({ greetingName }: ChatShellProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    const result = await postJson("/api/auth/logout");
    if (result.ok) router.refresh();
    else setError(result.message);
  }

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
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
