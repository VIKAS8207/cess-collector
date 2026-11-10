"use client";

import { useState } from "react";
import { CircleSlashIcon, EyeIcon, PackageIcon, RotateCcwIcon } from "lucide-react";
import { type Column } from "@/components/ui/data-table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Pill } from "@/components/ui/pill";
import { useToast } from "@/components/gate/toast";
import { useLiveQuery } from "@/hooks/use-live-query";
import { DispatchDrawer } from "@/components/supplier/dispatch-drawer";
import { RosterShell, type CreateSlotCtx, type EditSlotCtx } from "@/components/admin/roles/roster-shell";
import { DispatchForm } from "@/components/supplier/dispatch-form";
import { useSupplier } from "@/components/supplier/use-supplier";
import {
  getDispatches,
  submitCreateDispatch,
  submitMarkNotReached,
  submitReopenDispatch,
  submitUpdateDispatch,
  summarize,
  type DispatchRow,
} from "@/lib/api/dispatch";
import { gateStateLabel, hasArrived } from "@/lib/domain/dispatch-store";
import type { SupplierRecord } from "@/lib/domain/admin-types";
import { formatDate, formatInr, formatNumber, formatStamp } from "@/lib/format";

const columns: Column<DispatchRow>[] = [
  {
    key: "plate",
    header: "Vehicle",
    primary: true,
    cell: (r) => (
      <span className="flex flex-col">
        <span>{r.plate}</span>
        <span className="text-caption text-muted-foreground">{r.no}</span>
      </span>
    ),
  },
  {
    key: "driver",
    header: "Driver",
    hideBelow: "lg",
    cell: (r) => (
      <span className="flex flex-col">
        <span>{r.driverName}</span>
        <span className="text-caption tabular-nums text-muted-foreground">{r.driverPhone}</span>
      </span>
    ),
  },
  { key: "goods", header: "Goods", cell: (r) => r.commodity },
  { key: "qty", header: "Quantity", align: "right", hideBelow: "xl", cell: (r) => `${formatNumber(r.quantity)} ${r.unit}` },
  { key: "value", header: "Cost", align: "right", cell: (r) => formatInr(r.value) },
  {
    key: "gate",
    header: "Gate status",
    cell: (r) => (
      <span className="flex flex-col items-start gap-1">
        <Pill tone={r.gate.state === "not_reached" ? "danger" : hasArrived(r.gate.state) ? "brand" : "neutral"}>{gateStateLabel[r.gate.state]}</Pill>
        {r.gate.entryAt ? (
          <span className="text-caption tabular-nums text-muted-foreground">
            {r.gate.entryNo} · {formatStamp(r.gate.entryAt)}
          </span>
        ) : null}
      </span>
    ),
  },
  {
    key: "created",
    header: "Sent",
    hideBelow: "2xl",
    cell: (r) => <span className="text-caption tabular-nums text-muted-foreground">{formatDate(r.createdAt)}</span>,
  },
];

/**
 * The supplier's own page. After login a supplier registers each truck they
 * send (vehicle, driver, goods, quantity and cost) and watches whether it has
 * been scanned at the gate. The page always belongs to whoever is signed in:
 * their supplier record when there is one, otherwise a blank one made from the
 * login. An admin viewing as supplier sees the first supplier's trucks as a demo.
 */
export function DispatchPage() {
  const { supplier, demo } = useSupplier();
  if (!supplier) return null;
  return <DispatchRoster key={supplier.id} supplier={supplier} showHeader={!demo} />;
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-card border border-border bg-background p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-display-md tabular-nums text-foreground">{value}</dd>
      {note && <dd className="text-caption text-muted-foreground">{note}</dd>}
    </div>
  );
}

const statGrid = "grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr))]";

function Summary({ rows }: { rows: DispatchRow[] }) {
  const s = summarize(rows);
  const qty = s.quantity.length ? s.quantity.map((q) => `${formatNumber(q.qty)} ${q.unit}`).join(" · ") : "0";
  return (
    <dl className={statGrid} aria-label="Dispatch summary">
      <Stat label="Total dispatches" value={formatNumber(s.total)} note={`${s.onTheWay} on the way`} />
      <Stat label="Reached the gate" value={formatNumber(s.reached)} note={`${formatInr(s.valueReached)} of goods`} />
      <Stat label="Not reached" value={formatNumber(s.notReached)} />
      <Stat label="Total cost sent" value={formatInr(s.value)} />
      <Stat label="Total quantity" value={qty} />
    </dl>
  );
}

function DispatchRoster({ supplier, showHeader }: { supplier: SupplierRecord; showHeader: boolean }) {
  const toast = useToast();
  const all = useLiveQuery(`dispatch-all:${supplier.id}`, () => getDispatches(supplier, ""));
  const [viewId, setViewId] = useState<string | null>(null);
  const [missing, setMissing] = useState<DispatchRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const rows = all.status === "ready" ? all.data : [];

  const markMissing = async () => {
    if (!missing) return;
    setBusy(true);
    setProblem(null);
    const res = await submitMarkNotReached(missing.id, "");
    setBusy(false);
    if (res.ok) {
      toast.push(`${missing.plate} marked as not reached.`);
      setMissing(null);
    } else setProblem(res.reason);
  };

  return (
    <>
    <RosterShell<DispatchRow>
      roleId={`dispatch-${supplier.id}`}
      label="Dispatches"
      description={showHeader ? "Register each truck you send, and see when it is scanned at the gate." : `Trucks sent by ${supplier.name}.`}
      searchPlaceholder="Vehicle, driver or goods"
      emptyIcon={PackageIcon}
      emptyText={(q) => (q ? "No dispatches match." : "No trucks registered yet.")}
      countLabel={(n) => `${n} ${n === 1 ? "dispatch" : "dispatches"}`}
      load={(q) => getDispatches(supplier, q)}
      columns={columns}
      rowKey={(r) => r.id}
      rowName={(r) => `${r.no} (${r.plate})`}
      minWidth={720}
      createHeading="Register a truck"
      createHint="Choose the vehicle or type its number, then the driver, goods and cost."
      renderCreate={(ctx) => <DispatchCreate supplier={supplier} ctx={ctx} />}
      renderEdit={(row, ctx) => <DispatchEdit key={row.id} supplier={supplier} row={row} ctx={ctx} />}
      canEdit={(row) => row.gate.state === "expected"}
      aboveTable={all.status === "ready" ? <Summary rows={rows} /> : undefined}
      extraActions={(row) => [
        { label: "View", icon: EyeIcon, onSelect: () => setViewId(row.id) },
        ...(row.gate.state === "expected"
          ? [{ label: "Mark as not reached", icon: CircleSlashIcon, onSelect: () => { setProblem(null); setMissing(row); } }]
          : []),
        ...(row.gate.state === "not_reached"
          ? [{
              label: "Reopen",
              icon: RotateCcwIcon,
              onSelect: async () => {
                await submitReopenDispatch(row.id);
                toast.push(`${row.plate} is on the way again.`);
              },
            }]
          : []),
      ]}
    />
    <DispatchDrawer row={rows.find((r) => r.id === viewId) ?? null} onClose={() => setViewId(null)} />
    <ConfirmDialog
      open={!!missing}
      title={missing ? `Mark ${missing.plate} as not reached?` : "Mark as not reached"}
      message="Use this when the truck never came. The dispatch stays in your history and you can reopen it later."
      confirmLabel="Mark not reached"
      busy={busy}
      error={problem}
      onConfirm={markMissing}
      onClose={() => setMissing(null)}
    />
    </>
  );
}

function DispatchCreate({ supplier, ctx }: { supplier: SupplierRecord; ctx: CreateSlotCtx }) {
  const [busy, setBusy] = useState(false);
  return (
    <DispatchForm
      supplier={supplier}
      busy={busy}
      submitLabel="Register truck"
      onCancel={ctx.close}
      onSubmit={async (input) => {
        setBusy(true);
        const d = await submitCreateDispatch(input);
        setBusy(false);
        ctx.created(d.id, d.no, `${d.plate} registered. The gate will see the driver and goods when it arrives.`);
      }}
    />
  );
}

function DispatchEdit({ supplier, row, ctx }: { supplier: SupplierRecord; row: DispatchRow; ctx: EditSlotCtx }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <DispatchForm
      supplier={supplier}
      initial={row}
      busy={busy}
      problem={problem}
      submitLabel="Save changes"
      onCancel={ctx.close}
      onSubmit={async (input) => {
        setBusy(true);
        setProblem(null);
        const res = await submitUpdateDispatch(row.id, input);
        setBusy(false);
        if (res.ok) ctx.saved(`${input.plate} updated.`);
        else setProblem(res.reason);
      }}
    />
  );
}
