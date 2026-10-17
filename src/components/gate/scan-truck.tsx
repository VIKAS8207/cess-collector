"use client";

import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { QrCodeIcon, ScanLineIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { QrScanner } from "@/components/gate-exit/qr-scanner";
import { lookupScan } from "@/lib/api/gate";
import type { Movement } from "@/lib/domain/types";

/**
 * "Scan truck" button for any page that works against a truck. Opens a popup with the
 * camera scanner and a typed field (handheld scanner or manual entry). Calls `onFound`
 * with the truck's gate record, so the page can carry on with its own process.
 */
export function ScanTruckButton({
  onFound,
  label = "Scan truck",
  variant = "outline",
}: {
  onFound: (m: Movement) => void;
  label?: string;
  variant?: "outline" | "ghost";
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [looking, setLooking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const run = async (raw: string) => {
    if (!raw.trim() || looking) return;
    setLooking(true);
    setProblem(null);
    const r = await lookupScan(raw);
    setLooking(false);
    if (r.kind === "none") {
      setProblem(`No truck found for ${r.code}. Check the code and try again.`);
      return;
    }
    setCode("");
    setOpen(false);
    onFound(r.movement);
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setProblem(null);
          setCode("");
        }
      }}
    >
      <Dialog.Trigger render={<Button type="button" variant={variant} />}>
        <QrCodeIcon aria-hidden="true" />
        {label}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[70] bg-foreground/40 transition-opacity duration-200 data-[starting-style]:opacity-0" />
        <Dialog.Popup
          data-print-hide
          className="fixed top-1/2 left-1/2 z-[80] flex max-h-[92vh] w-[min(92vw,460px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 overflow-y-auto rounded-card border border-border bg-background p-6 shadow-panel outline-none transition-[opacity,transform] duration-200 data-[starting-style]:scale-95 data-[starting-style]:opacity-0"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <Dialog.Title className="text-heading-lg text-foreground">Scan the truck</Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground">
                Scan the entry QR code, or type the entry number, plate or FASTag.
              </Dialog.Description>
            </div>
            <Dialog.Close render={<Button variant="ghost" size="icon" aria-label="Close" />}>
              <XIcon aria-hidden="true" />
            </Dialog.Close>
          </div>
          <QrScanner onScan={(t) => void run(t)} disabled={looking} />
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run(code);
            }}
          >
            <label htmlFor="scan-truck-field" className="text-sm text-foreground">
              Scanner field
            </label>
            <div className="relative">
              <ScanLineIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="scan-truck-field"
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder="Scan, or type entry no, plate or FASTag"
                className="h-12 pr-12 pl-10"
              />
              {looking && <Spinner className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground" />}
            </div>
            {problem && (
              <p role="alert" className="text-sm text-destructive">
                {problem}
              </p>
            )}
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={looking || !code.trim()}>
                Find truck
              </Button>
              <Dialog.Close render={<Button type="button" variant="ghost" />}>Cancel</Dialog.Close>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
