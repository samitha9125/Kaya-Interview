import { SignInCard } from "@/components/auth/sign-in-card";
import {
  BehindTheScenesProvider,
  BehindTheScenesToggle,
} from "@/components/chat/behind-the-scenes";
import { ChatShell } from "@/components/chat/chat-shell";
import { SiteHeader } from "@/components/site-header";
import { readPageSession } from "@/server/harness/page-session";
import { isDemoMode } from "@/server/harness/routes";

// Rendered per request: it depends on the session cookie, and the CSP
// nonce needs a dynamic render.
export default async function Home() {
  const session = await readPageSession();
  if (session.kind === "signed_out") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center p-6">
        <SignInCard />
      </main>
    );
  }
  const isDemo = isDemoMode();
  // One screen tall, so only the conversation scrolls and the message box
  // stays at the bottom.
  return (
    <BehindTheScenesProvider>
      <div className="flex h-dvh flex-col">
        <SiteHeader
          signOutLabel={session.kind === "customer" ? "Sign out" : "Leave"}
          tools={isDemo && <BehindTheScenesToggle />}
        />
        <main className="flex min-h-0 flex-1 flex-col items-center px-4 sm:px-6">
          <ChatShell
            greetingName={session.kind === "customer" ? session.name : null}
            restored={session.conversation}
            isDemo={isDemo}
          />
        </main>
      </div>
    </BehindTheScenesProvider>
  );
}
