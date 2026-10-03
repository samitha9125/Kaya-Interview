"use client";

import { useState } from "react";
import { postJson } from "@/components/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

// What each mode does to the mock government service (SPEC §6.9).
const MODE_NAMES: Record<string, string> = {
  normal: "Normal",
  slow: "Slow (answers after our 5-second timeout)",
  error: "Error (500)",
  rate_limited: "Rate limited (429, retry in an hour)",
  down: "Down (503)",
};

export function DemoControls({ failureModes }: { failureModes: readonly string[] }) {
  const [mode, setMode] = useState(failureModes[0] ?? "normal");
  const [isBusy, setIsBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(url: string, body: Record<string, unknown>, done: string) {
    setIsBusy(true);
    setStatus(null);
    setError(null);
    const result = await postJson(url, body);
    setIsBusy(false);
    if (result.ok) setStatus(done);
    else setError(result.message);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={isBusy}
          onClick={() =>
            void run(
              "/api/demo/reset-limit",
              {},
              "Today's government limit is reset. A fresh credit check is allowed.",
            )
          }
        >
          Reset today&apos;s government limit
        </Button>
        <Button
          variant="outline"
          disabled={isBusy}
          onClick={() =>
            void run(
              "/api/demo/clear-cache",
              {},
              "The credit cache is cleared. The next check asks the government service.",
            )
          }
        >
          Clear the credit cache
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="failure-mode">Government service behaviour</Label>
        <div className="flex gap-2">
          <select
            id="failure-mode"
            value={mode}
            onChange={(event) => setMode(event.target.value)}
            disabled={isBusy}
            className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
          >
            {failureModes.map((value) => (
              <option key={value} value={value}>
                {MODE_NAMES[value] ?? value}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            disabled={isBusy}
            onClick={() =>
              void run(
                "/api/demo/failure-mode",
                { mode },
                `The government service is now: ${MODE_NAMES[mode] ?? mode}.`,
              )
            }
          >
            Apply
          </Button>
        </div>
      </div>
      {status && (
        <p role="status" className="text-sm text-muted-foreground">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
