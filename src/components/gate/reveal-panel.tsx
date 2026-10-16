"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "cn";

/**
 * Open/close state for a form that slides down from the top of a page and
 * pushes the content below it. `mounted` keeps the form in the page while it
 * animates; `expanded` drives the slide itself.
 */
export function useReveal(focusId?: string, initialOpen = false) {
  const [mounted, setMounted] = useState(initialOpen);
  const [expanded, setExpanded] = useState(initialOpen);
  const [key, setKey] = useState(0);

  // A collapsed panel ignores focus, so focus the first field once it has opened.
  const focusLater = () => {
    if (focusId) setTimeout(() => document.getElementById(focusId)?.focus(), 360);
  };

  const open = () => {
    if (mounted) {
      setKey((k) => k + 1);
      setExpanded(true);
      focusLater();
      return;
    }
    setMounted(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setExpanded(true)));
    focusLater();
  };

  const close = () => {
    setExpanded(false);
    setTimeout(() => setMounted(false), 350);
  };

  return { mounted, expanded, key, open, close };
}

export function RevealPanel({
  id,
  mounted,
  expanded,
  title,
  onCancel,
  wide,
  children,
}: {
  id: string;
  mounted: boolean;
  expanded: boolean;
  title: string;
  onCancel: () => void;
  /** Wide panels use the full content width instead of a centered column. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      id={id}
      className={cn(
        "-my-4 grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
        expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      )}
      inert={!expanded}
      aria-hidden={!expanded}
    >
      <div className="min-h-0 overflow-hidden">
        {mounted && (
          <div className={cn("flex w-full flex-col gap-4 py-4", !wide && "mx-auto max-w-220")}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-heading-md text-foreground">{title}</h2>
              <Button variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            </div>
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
