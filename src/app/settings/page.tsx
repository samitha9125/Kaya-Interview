import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { DemoControls } from "@/components/settings/demo-controls";
import { ModelsForm } from "@/components/settings/models-form";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { readPageSession } from "@/server/harness/page-session";
import { settingsView } from "@/server/harness/routes";

export const metadata = { title: "Settings · Bank Assistant" };

const percent = (basisPoints: number) => `${basisPoints / 100}%`;

// Rendered per request: the choices, the key's status and the catalogue
// can change at any time, and the CSP nonce needs a dynamic render.
export default async function SettingsPage() {
  const [view, session] = await Promise.all([settingsView(), readPageSession()]);
  const signOutLabel =
    session.kind === "customer" ? "Sign out" : session.kind === "guest" ? "Leave" : null;
  return (
    <>
      <SiteHeader signOutLabel={signOutLabel} isOnSettings />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
        <header className="flex items-start gap-3">
          <Link
            href="/"
            aria-label="Back to chat"
            className={buttonVariants({ variant: "ghost", size: "icon" })}
          >
            <ArrowLeftIcon aria-hidden />
          </Link>
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold">Settings</h1>
            <p className="text-sm text-muted-foreground">How the assistant works for this bank.</p>
          </div>
        </header>

        {/* Two columns from lg up, so the demo controls sit beside the
            models instead of below the fold. */}
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle>
                  <h2>Status</h2>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="flex flex-col divide-y">
                  <StatusRow
                    label="OpenRouter key"
                    help={
                      view.keyStatus === "missing"
                        ? "The assistant can't answer without it. Add OPENROUTER_API_KEY to the server environment and restart."
                        : undefined
                    }
                  >
                    {view.keyStatus === "configured" ? (
                      <Badge className="bg-success/10 text-success">Connected</Badge>
                    ) : (
                      <Badge variant="destructive">Missing</Badge>
                    )}
                  </StatusRow>
                  <StatusRow
                    label="Auto-decision threshold"
                    help="Below this confidence, a loan officer decides. Set by the bank (AUTO_DECISION_THRESHOLD)."
                  >
                    <span className="text-sm font-medium">{percent(view.thresholdBp)}</span>
                  </StatusRow>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  <h2>Models</h2>
                </CardTitle>
                <CardDescription>
                  Each assistant role uses its own model. Changes apply to new conversations.
                </CardDescription>
              </CardHeader>
              {!view.models && (
                <CardContent>
                  <p role="alert" className="text-sm text-destructive">
                    We couldn&apos;t load the model list just now, so models can&apos;t be changed.
                    Please try again later.
                  </p>
                </CardContent>
              )}
              <ModelsForm roles={view.roles} models={view.models} canChange={view.canChange} />
            </Card>
          </div>

          {view.canChange ? (
            <Card>
              <CardHeader>
                <CardTitle>
                  <h2>Demo controls</h2>
                </CardTitle>
                <CardDescription>For testing only. Off when DEMO_MODE is false.</CardDescription>
                <CardAction>
                  <Badge variant="outline">Demo mode</Badge>
                </CardAction>
              </CardHeader>
              <DemoControls
                failureModes={view.failureModes}
                govChecks={view.govChecks}
                isCustomer={session.kind === "customer"}
              />
            </Card>
          ) : (
            <p role="note" className="text-sm text-muted-foreground">
              Settings are read-only: changes and demo controls are off outside demo mode.
            </p>
          )}
        </div>
      </main>
    </>
  );
}

function StatusRow({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0">
      <dt className="text-sm font-medium">{label}</dt>
      <dd>{children}</dd>
      {help && <dd className="col-span-2 text-sm text-muted-foreground">{help}</dd>}
    </div>
  );
}
