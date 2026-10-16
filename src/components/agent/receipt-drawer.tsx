"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { SideDrawer } from "@/components/gate/side-drawer";
import { MatchChip, ReceiptPills } from "@/components/agent/pills";
import { getParty, getReceipt, lineStock, receiptRemaining } from "@/lib/domain/agent-store";
import { useStoreVersion } from "@/lib/domain/store";
import { formatQty, formatStamp } from "@/lib/format";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <dt className="text-caption text-muted-foreground sm:w-36 sm:shrink-0">{label}</dt>
      <dd className="min-w-0 text-[15px] break-words text-foreground">{value || "—"}</dd>
    </div>
  );
}

export function ReceiptDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  useStoreVersion();
  const r = id ? getReceipt(id) : undefined;
  const canSell = r ? receiptRemaining(r).length > 0 : false;

  return (
    <SideDrawer
      open={!!r}
      onClose={onClose}
      wide
      title={r ? `${r.plate || "No plate"} · ${r.no}` : ""}
      description={r && <ReceiptPills receipt={r} />}
      footer={
        r && (
          <>
            {canSell && (
              <Link href={`/sales?receipt=${r.id}`} className={buttonVariants()}>
                Record sale
              </Link>
            )}
            <Link href={`/sales?q=${encodeURIComponent(r.no)}`} className={buttonVariants({ variant: "outline" })}>
              Open in Sales
            </Link>
          </>
        )
      }
    >
      {r && (
        <>
          <section aria-labelledby="rd-vehicle" className="flex flex-col gap-4">
            <h3 id="rd-vehicle" className="text-heading-md text-foreground">
              Vehicle
            </h3>
            <dl className="flex flex-col gap-3">
              <Row label="Driver" value={r.driverName} />
              <Row label="Transporter" value={r.transporter} />
              <Row label="Gate entry" value={r.entryAt ? formatStamp(r.entryAt) : ""} />
              <Row label="Received" value={`${formatStamp(r.receivedAt)} by ${r.agent}`} />
              <Row label="Seller" value={getParty(r.sellerId)?.name} />
              <Row label="Remark" value={r.remark} />
              {r.flaggedReason && <Row label="Flagged vehicle" value={r.flaggedReason} />}
            </dl>
          </section>
          <section aria-labelledby="rd-lines" className="flex flex-col gap-4">
            <h3 id="rd-lines" className="text-heading-md text-foreground">
              Goods
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-[15px]">
                <caption className="sr-only">Goods lines with remaining stock</caption>
                <thead>
                  <tr className="h-10 border-b border-border text-left text-caption text-muted-foreground">
                    <th scope="col" className="font-normal">Item</th>
                    <th scope="col" className="text-right font-normal">Expected</th>
                    <th scope="col" className="text-right font-normal">Received</th>
                    <th scope="col" className="text-right font-normal">Wastage</th>
                    <th scope="col" className="text-right font-normal">Sold</th>
                    <th scope="col" className="text-right font-normal">Left</th>
                  </tr>
                </thead>
                <tbody>
                  {r.lines.map((l) => {
                    const st = lineStock(r, l);
                    return (
                      <tr key={l.id} className="border-b border-border align-top">
                        <th scope="row" className="py-3 pr-3 text-left font-normal">
                          <span className="block">{l.item}</span>
                          <span className="mt-1 flex items-center gap-2 text-caption text-muted-foreground">
                            {l.unit} <MatchChip expected={l.expected} actual={l.actual} />
                          </span>
                          {l.wastageRemark && (
                            <span className="mt-1 block text-caption text-muted-foreground">{l.wastageRemark}</span>
                          )}
                        </th>
                        <td className="py-3 text-right tabular-nums">{l.expected === null ? "—" : formatQty(l.expected)}</td>
                        <td className="py-3 text-right tabular-nums">{formatQty(l.actual)}</td>
                        <td className="py-3 text-right tabular-nums">{formatQty(l.wastage)}</td>
                        <td className="py-3 text-right tabular-nums">
                          {formatQty(st.sold)}
                          {st.returned > 0 && (
                            <Pill tone="neutral" className="ml-1">
                              -{formatQty(st.returned)} back
                            </Pill>
                          )}
                        </td>
                        <td className="py-3 text-right tabular-nums">{formatQty(st.remaining)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </SideDrawer>
  );
}
