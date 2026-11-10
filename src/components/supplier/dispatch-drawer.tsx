"use client";

import { Pill } from "@/components/ui/pill";
import { SideDrawer } from "@/components/gate/side-drawer";
import { gateStateLabel } from "@/lib/domain/dispatch-store";
import type { DispatchRow } from "@/lib/api/dispatch";
import { formatInr, formatNumber, formatStamp } from "@/lib/format";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <dt className="text-caption text-muted-foreground sm:w-40 sm:shrink-0">{label}</dt>
      <dd className="text-[15px] break-words text-foreground">{value || "—"}</dd>
    </div>
  );
}

/** Read-only view of one dispatch: what was sent, and what the gate has seen of it. */
export function DispatchDrawer({ row, onClose }: { row: DispatchRow | null; onClose: () => void }) {
  const g = row?.gate;
  return (
    <SideDrawer
      open={!!row}
      onClose={onClose}
      wide
      title={row ? `${row.plate} · ${row.no}` : ""}
      description={row && g && <Pill tone={g.state === "not_reached" ? "danger" : g.state === "expected" ? "neutral" : "brand"}>{gateStateLabel[g.state]}</Pill>}
    >
      {row && g && (
        <>
          <section className="flex flex-col gap-4" aria-labelledby="dd-goods">
            <h3 id="dd-goods" className="text-heading-md text-foreground">Goods</h3>
            <dl className="flex flex-col gap-3">
              <Row label="Goods" value={row.commodity} />
              <Row label="Quantity" value={`${formatNumber(row.quantity)} ${row.unit}`} />
              <Row label="Cost of the goods" value={formatInr(row.value)} />
              <Row label="Notes" value={row.notes} />
              <Row label="Registered" value={formatStamp(row.createdAt)} />
            </dl>
          </section>

          <section className="flex flex-col gap-4" aria-labelledby="dd-driver">
            <h3 id="dd-driver" className="text-heading-md text-foreground">Vehicle and driver</h3>
            <dl className="flex flex-col gap-3">
              <Row label="Vehicle" value={row.plate} />
              <Row label="Driver" value={row.driverName} />
              <Row label="Driver mobile" value={row.driverPhone} />
              <Row label="Transporter" value={row.transporter} />
            </dl>
          </section>

          <section className="flex flex-col gap-4" aria-labelledby="dd-gate">
            <h3 id="dd-gate" className="text-heading-md text-foreground">At the gate</h3>
            {g.state === "expected" && <p className="text-sm text-muted-foreground">The truck has not been scanned at the gate yet.</p>}
            {g.state === "not_reached" && (
              <p className="text-sm text-muted-foreground">
                Marked as not reached{row.notReachedAt ? ` on ${formatStamp(row.notReachedAt)}` : ""}.
                {row.notReachedReason ? ` ${row.notReachedReason}` : ""}
              </p>
            )}
            {g.entryAt && (
              <dl className="flex flex-col gap-3">
                <Row label="Entry no" value={g.entryNo ?? ""} />
                <Row label="Scanned at gate" value={formatStamp(g.entryAt)} />
                <Row label="Gate" value={g.gate ?? ""} />
                <Row label="Net weight" value={g.netKg != null ? `${formatNumber(g.netKg)} kg` : "Not weighed yet"} />
                <Row label="Left the gate" value={g.exitAt ? formatStamp(g.exitAt) : "Still inside"} />
              </dl>
            )}
          </section>
        </>
      )}
    </SideDrawer>
  );
}
