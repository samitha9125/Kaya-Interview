"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/components/api";
import { Button, buttonVariants } from "@/components/ui/button";

// signOutLabel is null when nobody is signed in, so there's nothing to leave.
type SiteHeaderProps = { signOutLabel: "Sign out" | "Leave" | null; isOnSettings?: boolean };

// Sticky, so the way to Settings and out stays in reach while the page
// scrolls. The outline keeps the red text at AA contrast; the tinted
// destructive fill would not.
export function SiteHeader({ signOutLabel, isOnSettings = false }: SiteHeaderProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    setError(null);
    const result = await postJson("/api/auth/logout");
    if (!result.ok) return setError(result.message);
    router.replace("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-10 border-b bg-background">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="text-lg font-semibold">
          Bank Assistant
        </Link>
        <nav aria-label="Account" className="flex items-center gap-4">
          {!isOnSettings && (
            <Link href="/settings" className={buttonVariants({ variant: "ghost" })}>
              Settings
            </Link>
          )}
          {signOutLabel && (
            <Button
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/5 hover:text-destructive"
              onClick={() => void signOut()}
            >
              {signOutLabel}
            </Button>
          )}
        </nav>
      </div>
      {error && (
        <p role="alert" className="mx-auto max-w-5xl px-4 pb-2 text-sm text-destructive sm:px-6">
          {error}
        </p>
      )}
    </header>
  );
}
