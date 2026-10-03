import { SignInCard } from "@/components/auth/sign-in-card";
import { ChatShell } from "@/components/chat/chat-shell";
import { readPageSession } from "@/server/harness/page-session";

// Rendered per request: it depends on the session cookie, and the CSP
// nonce needs a dynamic render.
export default async function Home() {
  const session = await readPageSession();
  return (
    <main className="flex flex-1 flex-col items-center justify-center p-6">
      {session.kind === "signed_out" ? (
        <SignInCard />
      ) : (
        <ChatShell greetingName={session.kind === "customer" ? session.name : null} />
      )}
    </main>
  );
}
