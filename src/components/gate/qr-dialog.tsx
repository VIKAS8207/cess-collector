"use client";

import { Dialog } from "@base-ui/react/dialog";
import { DownloadIcon, PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadQrPng, printQr, QrCode, qrPayload } from "@/components/gate/qr-code";
import { getMovement, useStoreVersion } from "@/lib/domain/store";
import { formatStamp } from "@/lib/format";

/**
 * The entry QR popup. Shown right after an entry is saved and again whenever the
 * QR button in the entries table is used: both open this same dialog with the same code.
 */
export function QrDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  useStoreVersion();
  const m = id ? getMovement(id) : undefined;
  const value = m ? qrPayload(m) : "";
  const closed = m?.status === "Exited";

  return (
    <Dialog.Root open={!!m} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[70] bg-foreground/40 transition-opacity duration-200 data-[starting-style]:opacity-0" />
        <Dialog.Popup
          data-print-hide
          className="fixed top-1/2 left-1/2 z-[80] flex w-[min(92vw,400px)] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-5 rounded-card border border-border bg-background p-6 text-center shadow-panel outline-none transition-[opacity,transform] duration-200 data-[starting-style]:scale-95 data-[starting-style]:opacity-0"
        >
          {m && (
            <>
              <div className="flex flex-col gap-1">
                <Dialog.Title className="text-heading-lg text-foreground">{closed ? "QR code closed" : "Entry QR code"}</Dialog.Title>
                <Dialog.Description className="text-sm text-muted-foreground">
                  {closed ? "This truck has left, so its QR code can no longer be used." : "Scan this at the exit gate to find the entry."}
                </Dialog.Description>
              </div>
              <div className={closed ? "relative opacity-30 grayscale" : undefined}>
                <QrCode value={value} size={232} label={`QR code for entry ${m.entryNo}`} />
              </div>
              <dl className="grid w-full grid-cols-2 gap-x-4 gap-y-2 text-left text-sm">
                <div>
                  <dt className="text-caption text-muted-foreground">Entry no</dt>
                  <dd className="tabular-nums text-foreground">{m.entryNo}</dd>
                </div>
                <div>
                  <dt className="text-caption text-muted-foreground">Plate</dt>
                  <dd className="text-foreground">{m.plate || "No plate"}</dd>
                </div>
                <div>
                  <dt className="text-caption text-muted-foreground">Driver</dt>
                  <dd className="text-foreground">{m.driverName}</dd>
                </div>
                <div>
                  <dt className="text-caption text-muted-foreground">Entry time</dt>
                  <dd className="tabular-nums text-foreground">{m.entryAt ? formatStamp(m.entryAt) : "—"}</dd>
                </div>
                {closed && m.exitAt && (
                  <div>
                    <dt className="text-caption text-muted-foreground">Closed at exit</dt>
                    <dd className="tabular-nums text-foreground">{formatStamp(m.exitAt)}</dd>
                  </div>
                )}
              </dl>
              <div className="flex w-full flex-wrap justify-center gap-3">
                <Button variant="outline" disabled={closed} onClick={() => downloadQrPng(value, `${m.entryNo}-qr.png`)}>
                  <DownloadIcon aria-hidden="true" />
                  Download
                </Button>
                <Button
                  variant="outline"
                  disabled={closed}
                  onClick={() =>
                    printQr(value, [
                      { label: "Entry no", value: m.entryNo },
                      { label: "Plate", value: m.plate || "No plate" },
                      { label: "Driver", value: m.driverName },
                      { label: "Entry time", value: m.entryAt ? formatStamp(m.entryAt) : "" },
                    ])
                  }
                >
                  <PrinterIcon aria-hidden="true" />
                  Print
                </Button>
                <Dialog.Close render={<Button />}>Done</Dialog.Close>
              </div>
            </>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
