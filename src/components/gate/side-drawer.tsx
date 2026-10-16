"use client";

import { Dialog } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "cn";

/** Right-side sheet: focus trapped, Esc closes, scroll locked, focus returns to the trigger. */
export function SideDrawer({
  open,
  onClose,
  title,
  description,
  footer,
  wide,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-foreground/40 transition-opacity duration-200 data-[starting-style]:opacity-0" />
        <Dialog.Popup
          data-print-hide
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-border bg-background shadow-panel outline-none transition-transform duration-200 data-[starting-style]:translate-x-full",
            wide ? "max-w-[640px]" : "max-w-[480px]"
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-border p-6">
            <div className="flex min-w-0 flex-col gap-2">
              <Dialog.Title className="text-heading-lg break-words text-foreground">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close
              render={<Button variant="ghost" size="icon" aria-label="Close" title="Close (Esc)" />}
            >
              <XIcon aria-hidden="true" />
            </Dialog.Close>
          </div>
          <div className="flex flex-1 flex-col gap-8 overflow-y-auto p-6">{children}</div>
          {footer && <div className="flex flex-wrap gap-3 border-t border-border p-6">{footer}</div>}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
