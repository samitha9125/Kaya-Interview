"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { postJson } from "@/components/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { OptionPicker } from "./option-picker";

// What each mode does to the mock government service (SPEC §6.9).
const MODES: Record<string, { name: string; effect: string }> = {
  normal: { name: "Normal", effect: "Answers every check." },
  slow: { name: "Slow", effect: "Answers after our 5-second timeout, so checks fail." },
  error: { name: "Error", effect: "Fails with a server error (500)." },
  rate_limited: { name: "Rate limited", effect: "Refuses with 429 and asks us to wait an hour." },
  down: { name: "Down", effect: "Doesn't answer at all (503)." },
};

type Feedback = { row: string; text: string; isError: boolean };

type DemoControlsProps = {
  failureModes: readonly string[];
  // What the mock is doing now, so the picker starts there.
  failureMode: string;
  govChecks: { usedToday: number; perDay: number };
  isCustomer: boolean;
};

export function DemoControls({
  failureModes,
  failureMode,
  govChecks,
  isCustomer,
}: DemoControlsProps) {
  const router = useRouter();
  const [mode, setMode] = useState(failureMode);
  const modeOptions = useMemo(
    () => failureModes.map((value) => ({ id: value, name: MODES[value]?.name ?? value })),
    [failureModes],
  );
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  async function run(row: string, url: string, body: Record<string, unknown>, done: string) {
    setBusyRow(row);
    setFeedback(null);
    const result = await postJson(url, body);
    setBusyRow(null);
    setFeedback({ row, text: result.ok ? done : result.message, isError: !result.ok });
    if (result.ok) router.refresh();
  }

  const note = (row: string) =>
    feedback?.row === row && (
      <p
        role={feedback.isError ? "alert" : "status"}
        className={`text-sm ${feedback.isError ? "text-destructive" : "text-success"}`}
      >
        {feedback.text}
      </p>
    );

  return (
    <ul className="flex flex-col divide-y px-(--card-spacing)">
      <ControlRow
        title="Reset my demo data"
        description={
          isCustomer
            ? "Clears your applications and conversations so you can try a journey again."
            : "Sign in as a demo customer to use this."
        }
        note={note("data")}
      >
        <AlertDialog open={isConfirming} onOpenChange={setIsConfirming}>
          <AlertDialogTrigger
            render={
              <Button variant="destructive" disabled={!isCustomer || busyRow !== null}>
                Reset my data
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset your demo data?</AlertDialogTitle>
              <AlertDialogDescription>
                Clears your applications and conversations so you can try again. The audit log is
                kept.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => {
                  setIsConfirming(false);
                  void run("data", "/api/demo/reset-my-data", {}, "Your demo data is cleared.");
                }}
              >
                Reset my data
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </ControlRow>
      <ControlRow
        title="Reset today's government limit"
        description={`Allows ${govChecks.perDay} more credit checks today. ${govChecks.usedToday} of ${govChecks.perDay} used.`}
        note={note("limit")}
      >
        <Button
          variant="outline"
          disabled={busyRow !== null}
          onClick={() =>
            void run("limit", "/api/demo/reset-limit", {}, "Today's government limit is reset.")
          }
        >
          Reset limit
        </Button>
      </ControlRow>
      <ControlRow
        title="Clear the credit cache"
        description="The next check fetches a fresh score."
        note={note("cache")}
      >
        <Button
          variant="outline"
          disabled={busyRow !== null}
          onClick={() =>
            void run("cache", "/api/demo/clear-cache", {}, "The credit cache is cleared.")
          }
        >
          Clear cache
        </Button>
      </ControlRow>
      <ControlRow
        title="Age cached scores by 31 days"
        description="Past the 30-day lifetime after one press; past the 90-day stale window after three."
        note={note("age")}
      >
        <Button
          variant="outline"
          disabled={busyRow !== null}
          onClick={() =>
            void run("age", "/api/demo/age-cache", {}, "Cached scores are now 31 days older.")
          }
        >
          Age scores
        </Button>
      </ControlRow>
      <ControlRow
        title="Government CRIB Service behaviour"
        titleFor="failure-mode"
        description={MODES[mode]?.effect ?? ""}
        note={note("mode")}
      >
        <div className="flex gap-2">
          <div className="min-w-0 flex-1 sm:w-40">
            <OptionPicker
              id="failure-mode"
              searchLabel="Search behaviours"
              options={modeOptions}
              value={mode}
              disabled={busyRow !== null}
              onChange={setMode}
            />
          </div>
          <Button
            variant="outline"
            disabled={busyRow !== null}
            onClick={() =>
              void run(
                "mode",
                "/api/demo/failure-mode",
                { mode },
                `The government service is now: ${MODES[mode]?.name ?? mode}.`,
              )
            }
          >
            Apply
          </Button>
        </div>
      </ControlRow>
    </ul>
  );
}

type ControlRowProps = {
  title: string;
  titleFor?: string;
  description: string;
  note: ReactNode;
  children: ReactNode;
};

// One control: what it does on the left, the action on the right (stacked
// on a phone).
function ControlRow({ title, titleFor, description, note, children }: ControlRowProps) {
  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        {titleFor ? (
          <label htmlFor={titleFor} className="text-sm font-medium">
            {title}
          </label>
        ) : (
          <p className="text-sm font-medium">{title}</p>
        )}
        <p className="text-sm text-muted-foreground">{description}</p>
        {note}
      </div>
      <div className="shrink-0">{children}</div>
    </li>
  );
}
