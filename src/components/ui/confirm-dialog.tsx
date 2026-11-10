"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { FormBanner } from "@/components/auth/form-banner";

/**
 * A small "are you sure" popup for destructive actions. The caller owns the
 * busy and error state, so the dialog stays open and shows why a delete failed.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  busy = false,
  error,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[70] bg-foreground/40 transition-opacity duration-200 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-[80] flex w-[min(92vw,440px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 rounded-card border border-border bg-background p-6 shadow-panel outline-none transition-[opacity,transform] duration-200 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
          <div className="flex flex-col gap-2">
            <Dialog.Title className="text-heading-lg text-foreground">{title}</Dialog.Title>
            <Dialog.Description className="text-sm text-muted-foreground">{message}</Dialog.Description>
          </div>
          <FormBanner message={error ?? null} />
          <div className="flex flex-wrap gap-3 sm:justify-end">
            <Button variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onConfirm} disabled={busy} aria-busy={busy}>
              {busy && <Spinner />}
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
