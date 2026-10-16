"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { CircleAlertIcon, CircleCheckIcon, XIcon } from "lucide-react";

type Tone = "success" | "error";
type ToastItem = { id: number; message: string; tone: Tone };

const ToastContext = createContext<{ push: (message: string, tone?: Tone) => void } | null>(null);
let counter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message: string, tone: Tone = "success") => {
      counter += 1;
      const id = counter;
      setItems((list) => [...list, { id, message, tone }].slice(-3));
      setTimeout(() => dismiss(id), 5000);
    },
    [dismiss]
  );

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        data-print-hide
        className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      >
        {items.map((t) => {
          const Icon = t.tone === "success" ? CircleCheckIcon : CircleAlertIcon;
          return (
            <div
              key={t.id}
              className="pointer-events-auto flex items-start gap-3 rounded-card border border-border bg-popover p-4 text-sm text-popover-foreground shadow-panel"
            >
              <Icon
                aria-hidden="true"
                className={
                  t.tone === "success"
                    ? "size-5 shrink-0 text-primary"
                    : "size-5 shrink-0 text-destructive"
                }
              />
              <p className="min-w-0 flex-1 pt-0.5">{t.message}</p>
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() => dismiss(t.id)}
                className="-m-2 flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <XIcon aria-hidden="true" className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
