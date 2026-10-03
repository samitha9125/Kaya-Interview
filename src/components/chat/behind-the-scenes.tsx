"use client";

import { PanelRightCloseIcon, PanelRightOpenIcon } from "lucide-react";
import { createContext, use, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { InspectorSections, type InspectorView } from "./inspector-sections";

const PANEL_ID = "behind-the-scenes";
const TITLE = "Behind the scenes";
const DESCRIPTION = "Demo mode only. Customers never see this.";

type PanelState = {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  isSheetOpen: boolean;
  setIsSheetOpen: (isOpen: boolean) => void;
};

const CLOSED: PanelState = {
  isOpen: false,
  setIsOpen: () => {},
  isSheetOpen: false,
  setIsSheetOpen: () => {},
};

// The toggle sits in the site header and the panel beside the chat, so
// whether it's open is shared between them.
const PanelContext = createContext<PanelState>(CLOSED);

export function BehindTheScenesProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  return (
    <PanelContext value={{ isOpen, setIsOpen, isSheetOpen, setIsSheetOpen }}>
      {children}
    </PanelContext>
  );
}

// Demo mode only: what the bank's side did during this conversation. Read
// after each finished turn and whenever the panel opens; no polling.
export function useInspector(isEnabled: boolean, conversationId: string | null, turnsDone: number) {
  const panel = use(PanelContext);
  const [view, setView] = useState<InspectorView | null>(null);
  const [error, setError] = useState(false);
  const isShown = isEnabled && (panel.isOpen || panel.isSheetOpen);

  useEffect(() => {
    if (!isShown) return;
    const query = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : "";
    const controller = new AbortController();
    fetch(`/api/demo/inspector${query}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        setView((await response.json()) as InspectorView);
        setError(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [isShown, conversationId, turnsDone]);

  return { ...panel, view, error };
}

// One icon: on a phone it opens the drawer; from lg up it shows or hides
// the sidebar.
export function BehindTheScenesToggle() {
  const panel = use(PanelContext);
  const Icon = panel.isOpen ? PanelRightCloseIcon : PanelRightOpenIcon;
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        aria-label={TITLE}
        onClick={() => panel.setIsSheetOpen(true)}
      >
        <PanelRightOpenIcon aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="hidden lg:inline-flex"
        aria-label={TITLE}
        aria-expanded={panel.isOpen}
        aria-controls={PANEL_ID}
        onClick={() => panel.setIsOpen(!panel.isOpen)}
      >
        <Icon aria-hidden />
      </Button>
    </>
  );
}

type Inspector = ReturnType<typeof useInspector>;

export function BehindTheScenesPanel({ inspector }: { inspector: Inspector }) {
  const body = <InspectorSections view={inspector.view} error={inspector.error} />;
  return (
    <>
      {inspector.isOpen && (
        <aside
          id={PANEL_ID}
          aria-labelledby={`${PANEL_ID}-title`}
          className="hidden min-h-0 w-80 shrink-0 flex-col gap-4 border-l py-4 pl-6 lg:flex"
        >
          <header className="flex flex-col gap-0.5">
            <h2 id={`${PANEL_ID}-title`} className="font-semibold">
              {TITLE}
            </h2>
            <p className="text-xs text-muted-foreground">{DESCRIPTION}</p>
          </header>
          {body}
        </aside>
      )}
      <Sheet open={inspector.isSheetOpen} onOpenChange={inspector.setIsSheetOpen}>
        <SheetContent side="right" className="w-[90%] gap-0">
          <SheetHeader className="pr-12">
            <SheetTitle render={<h2 />}>{TITLE}</SheetTitle>
            <SheetDescription className="text-xs">{DESCRIPTION}</SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-4">{body}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}
