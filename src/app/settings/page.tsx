import Link from "next/link";
import { DemoControls } from "@/components/settings/demo-controls";
import { ModelPicker } from "@/components/settings/model-picker";
import { settingsView } from "@/server/harness/routes";

export const metadata = { title: "Settings · Bank Assistant" };

const percent = (basisPoints: number) => `${basisPoints / 100}%`;

// Rendered per request: the choices, the key's status and the catalogue
// can change at any time, and the CSP nonce needs a dynamic render.
export default async function SettingsPage() {
  const view = await settingsView();
  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <header className="flex items-center justify-between border-b pb-3">
          <h1 className="text-lg font-semibold">Settings</h1>
          <Link href="/" className="text-sm underline underline-offset-4">
            Back to chat
          </Link>
        </header>
        {!view.canChange && (
          <p role="note" className="text-sm text-muted-foreground">
            Settings are read-only here: changes and demo controls are turned off outside demo mode.
          </p>
        )}
        <section aria-labelledby="status-heading" className="flex flex-col gap-2">
          <h2 id="status-heading" className="font-medium">
            Status
          </h2>
          <p>
            OpenRouter key: <strong>{view.keyStatus}</strong>
          </p>
          {view.keyStatus === "missing" && (
            <p role="alert" className="text-sm text-destructive">
              Without a key the assistant can&apos;t answer. Add OPENROUTER_API_KEY to the server
              environment and restart.
            </p>
          )}
          <p>
            Confidence needed for an automatic decision:{" "}
            <strong>{percent(view.thresholdBp)}</strong>{" "}
            <span className="text-sm text-muted-foreground">
              (set by the bank in AUTO_DECISION_THRESHOLD)
            </span>
          </p>
        </section>
        <section aria-labelledby="models-heading" className="flex flex-col gap-4">
          <h2 id="models-heading" className="font-medium">
            Models
          </h2>
          <p className="text-sm text-muted-foreground">
            A change applies to new conversations only.
          </p>
          {!view.models && (
            <p role="alert" className="text-sm text-destructive">
              We couldn&apos;t load the model list just now, so models can&apos;t be changed. Please
              try again later.
            </p>
          )}
          {view.roles.map((choice) => (
            <ModelPicker
              key={choice.role}
              choice={choice}
              models={view.models}
              canChange={view.canChange}
            />
          ))}
        </section>
        {view.canChange && (
          <section aria-labelledby="demo-heading" className="flex flex-col gap-4">
            <h2 id="demo-heading" className="font-medium">
              Demo controls
            </h2>
            <DemoControls failureModes={view.failureModes} />
          </section>
        )}
      </div>
    </main>
  );
}
