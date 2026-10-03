"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { MODES } from "@/components/settings/demo-controls";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

// What GET /api/demo/inspector returns. Never a score: the cached entry
// comes as an age and a state only.
export type InspectorView = {
  service: {
    usedToday: number;
    perDay: number;
    status: { kind: "available" } | { kind: "blocked" | "cooling_down"; until: string };
    failureMode: string;
  };
  cachedScore:
    { state: "fresh" | "stale_usable" | "too_old"; ageDays: number } | { state: "none" } | null;
  timeline: { id: string; at: string; text: string }[];
};

const hourMinute = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const daysOld = (count: number) => (count === 1 ? "1 day old" : `${count} days old`);
const days = (count: number) => (count === 1 ? "1 day" : `${count} days`);

function describeCache(cached: InspectorView["cachedScore"]): string {
  if (!cached) return "Customers only";
  switch (cached.state) {
    case "none":
      return "None";
    case "fresh":
      return `Fresh, ${daysOld(cached.ageDays)}`;
    case "stale_usable":
      return `Expired, fallback only (${days(cached.ageDays)})`;
    case "too_old":
      return `Too old to use (${days(cached.ageDays)})`;
  }
}

function StatusBadge({ status }: { status: InspectorView["service"]["status"] }) {
  if (status.kind === "available") {
    return <Badge className="bg-success/10 text-success">Available</Badge>;
  }
  const label = status.kind === "blocked" ? "Blocked until" : "Cooling down until";
  return <Badge variant="destructive">{`${label} ${hourMinute(status.until)}`}</Badge>;
}

// One line per fact: label on the left, value on the right.
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-2 text-right">{children}</dd>
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
  return (
    <>
      <section aria-labelledby={`${id}-service`} className="flex shrink-0 flex-col gap-1 text-sm">
        <h3 id={`${id}-service`} className="font-semibold">
          Government credit service
        </h3>
        <dl className="flex flex-col">
          <Row label="Calls today">
            <span className="tabular-nums">{`${service.usedToday} of ${service.perDay}`}</span>
            <Progress
              value={service.usedToday}
              max={service.perDay}
              aria-label="Government calls used today"
              className="w-16"
            />
          </Row>
          <Row label="Status">
            <StatusBadge status={service.status} />
          </Row>
          <Row label="Behaviour">{MODES[service.failureMode]?.name ?? service.failureMode}</Row>
          <Row label="Cached score">{describeCache(view.cachedScore)}</Row>
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
