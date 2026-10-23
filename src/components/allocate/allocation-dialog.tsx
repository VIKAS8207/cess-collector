"use client";

import { Dialog } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { allAllocations } from "@/lib/domain/agent-store";
import { useStoreVersion } from "@/lib/domain/store";
import { cessStatusLabel, payModes } from "@/lib/domain/agent-types";
import { formatInr, formatQty, formatStamp } from "@/lib/format";

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="text-[15px] wrap-break-word text-foreground">{value || "—"}</dd>
    </div>
  );
}

/** Every detail of one allocation: the truck, the trader, the money and the product photo. */
export function AllocationDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  useStoreVersion();
  const a = id ? allAllocations().find((x) => x.id === id) : undefined;

  return (
    <Dialog.Root open={!!a} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[70] bg-foreground/40 transition-opacity duration-200 data-[starting-style]:opacity-0" />
        <Dialog.Popup
          data-print-hide
          className="fixed top-1/2 left-1/2 z-[80] flex max-h-[90vh] w-[min(94vw,880px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-6 overflow-y-auto rounded-card border border-border bg-background p-6 shadow-panel outline-none transition-[opacity,transform] duration-200 data-[starting-style]:scale-95 data-[starting-style]:opacity-0"
        >
          {a && (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <Dialog.Title className="text-heading-lg break-all text-foreground">{a.plate || "No plate"}</Dialog.Title>
                  <Dialog.Description className="text-caption text-muted-foreground">
                    <span className="tabular-nums">{a.no}</span> · {formatStamp(a.at)} · {a.agent}
                  </Dialog.Description>
                </div>
                <Dialog.Close render={<Button variant="ghost" size="icon" aria-label="Close details" />}>
                  <XIcon aria-hidden="true" />
                </Dialog.Close>
              </div>

              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Fact label="Trader" value={a.partyName} />
                <Fact label="Driver" value={a.driverName} />
                <Fact label="Product" value={a.product} />
                <Fact label="Quantity" value={<span className="tabular-nums">{formatQty(a.qty)} {a.unit}</span>} />
                <Fact label="Rate" value={<span className="tabular-nums">{formatInr(a.rate)} per {a.unit}</span>} />
                <Fact label="Goods value" value={<span className="tabular-nums">{formatInr(a.amount)}</span>} />
                <Fact label={`CESS (${a.cessLabel})`} value={<span className="tabular-nums">{formatInr(a.cess)}</span>} />
                <Fact label="Total with CESS" value={<span className="tabular-nums">{formatInr(a.amount + a.cess)}</span>} />
              </dl>

              <section aria-label="Consignment and buyer" className="flex flex-col gap-3">
                <h3 className="text-heading-md text-foreground">Consignment and buyer</h3>
                <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Fact label="Supplier" value={a.supplier} />
                  <Fact label="Origin" value={a.origin} />
                  <Fact label="Seller challan or invoice" value={a.challanNo} />
                  <Fact label="Net weight at bridge" value={a.bridgeNetKg !== null ? <span className="tabular-nums">{a.bridgeNetKg.toLocaleString("en-IN")} kg</span> : "Not weighed"} />
                  <Fact label="Bill or voucher no" value={a.billNo} />
                  <Fact label="Trader licence no" value={a.traderLicence} />
                  <Fact label="Trader GSTIN" value={a.traderGstin} />
                </dl>
              </section>

              <section aria-label="CESS collection" className="flex flex-col gap-3">
                <h3 className="text-heading-md text-foreground">CESS collection</h3>
                <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Fact label="Status" value={cessStatusLabel[a.cessStatus]} />
                  <Fact label="Received" value={<span className="tabular-nums">{formatInr(a.cessPaid)}</span>} />
                  <Fact label="Pending" value={<span className="tabular-nums">{formatInr(Math.max(0, a.cess - a.cessPaid))}</span>} />
                  <Fact label="Paid by" value={a.cessMode ? payModes.find((m) => m.value === a.cessMode)?.label : ""} />
                  <Fact label="Reference" value={a.cessRef} />
                  <Fact label="CESS receipt no" value={a.cessReceiptNo} />
                  <Fact label="Received by" value={a.cessReceivedBy} />
                </dl>
              </section>

              {a.photo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.photo} alt="Photo of the truck's product" className="aspect-8/5 w-full max-w-md rounded-field border border-border object-cover" />
              )}

              <div>
                <Dialog.Close render={<Button />}>Close</Dialog.Close>
              </div>
            </>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
