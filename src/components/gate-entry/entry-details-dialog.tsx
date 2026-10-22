"use client";

import { Dialog } from "@base-ui/react/dialog";
import { QrCodeIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/gate/status-pill";
import { getMovement, useStoreVersion } from "@/lib/domain/store";
import { weighSummary } from "@/lib/domain/types";
import { formatStamp } from "@/lib/format";

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="text-[15px] wrap-break-word text-foreground">{value || "—"}</dd>
    </div>
  );
}

/** Every detail recorded for one gate entry, opened from the View button in the entries table. */
export function EntryDetailsDialog({
  id,
  onClose,
  onShowQr,
}: {
  id: string | null;
  onClose: () => void;
  onShowQr: (id: string) => void;
}) {
  useStoreVersion();
  const m = id ? getMovement(id) : undefined;
  const w = weighSummary(m ?? {});

  return (
    <Dialog.Root open={!!m} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[70] bg-foreground/40 transition-opacity duration-200 data-[starting-style]:opacity-0" />
        <Dialog.Popup
          data-print-hide
          className="fixed top-1/2 left-1/2 z-[80] flex max-h-[90vh] w-[min(92vw,560px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-6 overflow-y-auto rounded-card border border-border bg-background p-6 shadow-panel outline-none transition-[opacity,transform] duration-200 data-[starting-style]:scale-95 data-[starting-style]:opacity-0"
        >
          {m && (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-2">
                  <Dialog.Title className="text-heading-lg break-all text-foreground">{m.plate || "No plate"}</Dialog.Title>
                  <Dialog.Description className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
                    <StatusPill movement={m} />
                    <span className="tabular-nums">{m.entryNo}</span>
                  </Dialog.Description>
                </div>
                <Dialog.Close render={<Button variant="ghost" size="icon" aria-label="Close details" />}>
                  <XIcon aria-hidden="true" />
                </Dialog.Close>
              </div>

              <dl className="grid gap-4 sm:grid-cols-2">
                <Fact label="Entry time" value={<span className="tabular-nums">{m.entryAt ? formatStamp(m.entryAt) : "—"}</span>} />
                <Fact label="Exit time" value={<span className="tabular-nums">{m.exitAt ? formatStamp(m.exitAt) : "Still inside"}</span>} />
                <Fact label="Plate" value={m.plate} />
                <Fact label="FASTag" value={<span className="tabular-nums">{m.fastag || (m.noFastag ? "No FASTag" : "")}</span>} />
                <Fact label="Vehicle type" value={m.vehicleType} />
                <Fact label="Vehicle class" value={m.vehicleClass} />
                <Fact label="Issuing bank" value={m.bank} />
                <Fact label="Driver" value={m.driverName} />
                <Fact label="Transporter" value={m.transporter} />
                <Fact label="Purpose" value={m.purpose} />
                <Fact label="Operator" value={m.operator} />
                <Fact label="Gate" value={m.gate} />
                {w.gross && <Fact label="Gross weight" value={<span className="tabular-nums">{w.gross.kg.toLocaleString("en-IN")} kg</span>} />}
                {w.tare && <Fact label="Tare weight" value={<span className="tabular-nums">{w.tare.kg.toLocaleString("en-IN")} kg</span>} />}
                {w.net !== null && <Fact label="Net goods" value={<span className="tabular-nums">{w.net.toLocaleString("en-IN")} kg</span>} />}
                {w.product && <Fact label="Product" value={w.product} />}
              </dl>

              <div className="flex flex-wrap gap-3">
                <Button variant="outline" onClick={() => onShowQr(m.id)}>
                  <QrCodeIcon aria-hidden="true" />
                  Show QR code
                </Button>
                <Dialog.Close render={<Button />}>Close</Dialog.Close>
              </div>
            </>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
