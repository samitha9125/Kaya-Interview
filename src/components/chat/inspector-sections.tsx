"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Progress } from "@/components/ui/progress";

// What GET /api/demo/inspector returns. Never a score: the saved entry
// comes as an age and a state only.
export type InspectorView = {
  service: {
    usedToday: number;
    perDay: number;
    cacheTtlDays: number;
    status: { kind: "available" } | { kind: "blocked" | "cooling_down"; until: string };
    failureMode: string;
  };
  cachedScore:
    { state: "fresh" | "stale_usable" | "too_old"; ageDays: number } | { state: "none" } | null;
  timeline: { id: string; at: string; text: string }[];
};

// What each Settings choice makes the mock government service do.
const SIMULATED: Record<string, string> = {
  normal: "Working normally",
  slow: "Too slow: every call times out",
  error: "Failing: every call errors (500)",
  rate_limited: "Refusing: too many requests (429)",
  down: "Down: no answer (503)",
};

const hourMinute = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const daysAgo = (count: number) =>
  count === 0 ? "today" : count === 1 ? "1 day ago" : `${count} days ago`;

function describeNextCheck(service: InspectorView["service"]): { text: string; canCall: boolean } {
  const { status } = service;
  if (status.kind === "blocked") {
    return {
      text: `Waits until ${hourMinute(status.until)}: the service said too many requests`,
      canCall: false,
    };
  }
  if (status.kind === "cooling_down") {
    return {
      text: `Waits until ${hourMinute(status.until)}: the service just failed, so we pause`,
      canCall: false,
    };
  }
  if (service.usedToday >= service.perDay) {
    return { text: "Waits until midnight: today's calls are used up", canCall: false };
  }
  return { text: "Will call the service", canCall: true };
}

function describeSavedScore(cached: InspectorView["cachedScore"]): string {
  if (!cached) return "Only for signed-in customers";
  switch (cached.state) {
    case "none":
      return "None yet, so the next check calls the service";
    case "fresh":
      return `Saved ${daysAgo(cached.ageDays)}: reused, no call needed`;
    case "stale_usable":
      return `Saved ${daysAgo(cached.ageDays)}: expired, used only if the next call fails`;
    case "too_old":
      return `Saved ${daysAgo(cached.ageDays)}: too old to use at all`;
  }
}

// Label on the left, the fact in plain words on the right.
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] items-baseline gap-x-3 py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-2">{children}</dd>
    </div>
  );
}

// Only the audit list scrolls; the service facts stay in view above it.
export function InspectorSections({ view, error }: { view: InspectorView | null; error: boolean }) {
  const listEnd = useRef<HTMLLIElement>(null);
  // Rendered in both the sidebar and the phone drawer, so ids must differ.
  const id = useId();
  // Newest last, so the latest event is the one in view.
  useEffect(() => {
    listEnd.current?.scrollIntoView({ block: "nearest" });
  }, [view]);

  if (!view) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {error ? "We couldn't load this just now." : "Loading…"}
      </p>
    );
  }
  const { service } = view;
  const nextCheck = describeNextCheck(service);
  return (
    <>
      <section aria-labelledby={`${id}-service`} className="flex shrink-0 flex-col gap-1 text-sm">
        <h3 id={`${id}-service`} className="font-semibold">
          Government credit checks
        </h3>
        <p className="text-xs text-muted-foreground">
          {`The whole bank may call the government service ${service.perDay} times a day. A customer's score is saved and reused for ${service.cacheTtlDays} days, so a repeat check needs no call.`}
        </p>
        <dl className="flex flex-col pt-1">
          <Row label="Calls today">
            <span className="tabular-nums">{`${service.usedToday} of ${service.perDay}`}</span>
            <Progress
              value={service.usedToday}
              max={service.perDay}
              aria-label="Government calls used today"
              className="w-16"
            />
          </Row>
          <Row label="Next check">
            <span className={nextCheck.canCall ? "text-success" : "text-destructive"}>
              {nextCheck.text}
            </span>
          </Row>
          <Row label="Simulating">{SIMULATED[service.failureMode] ?? service.failureMode}</Row>
          <Row label="Saved score">{describeSavedScore(view.cachedScore)}</Row>
        </dl>
      </section>
      <section
        aria-labelledby={`${id}-audit`}
        className="flex min-h-0 flex-1 flex-col gap-2 border-t pt-3 text-sm"
      >
        <h3 id={`${id}-audit`} className="font-semibold">
          Audit trail
        </h3>
        {view.timeline.length === 0 ? (
          <p className="text-muted-foreground">Nothing recorded yet.</p>
        ) : (
          <ol className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
            {view.timeline.map((line) => (
              <li key={line.id} className="grid grid-cols-[auto_1fr] gap-x-2">
                <time dateTime={line.at} className="text-muted-foreground tabular-nums">
                  {hourMinute(line.at)}
                </time>
                <span className="break-words">{line.text}</span>
              </li>
            ))}
            <li ref={listEnd} aria-hidden className="h-0" />
          </ol>
        )}
      </section>
    </>
  );
}
