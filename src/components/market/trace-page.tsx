"use client";

import { useEffect, useRef, useState } from "react";
import { EyeIcon, InfoIcon, QrCodeIcon, ScanLineIcon, SearchCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { BlockEmpty, BlockError } from "@/components/dashboard/block-states";
import { PageHeader } from "@/components/gate/page-header";
import { qrPayload } from "@/components/gate/qr-code";
import { StatusPill } from "@/components/gate/status-pill";
import { QrScanner } from "@/components/gate-exit/qr-scanner";
import { AllocationDialog } from "@/components/allocate/allocation-dialog";
import { getAllocations, getVehicleAllocations } from "@/lib/api/agent";
import { forcedErrors, getInside, lookupScan, type ScanLookup } from "@/lib/api/gate";
import type { Allocation } from "@/lib/domain/agent-types";
import { formatDate, formatQty, formatStamp, formatTime } from "@/lib/format";
import { useLiveQuery } from "@/hooks/use-live-query";
import { useHotkey } from "@/hooks/use-hotkey";

type View = "scan" | "list";

const BODY = "h-[520px]";

const listColumns: Column<Allocation>[] = [
  { key: "at", header: "Time", cell: (a) => <span className="text-caption tabular-nums text-muted-foreground">{formatStamp(a.at)}</span> },
  { key: "plate", header: "Vehicle", primary: true, cell: (a) => a.plate || "No plate" },
  { key: "agent", header: "Commission agent", cell: (a) => a.agent },
  { key: "trader", header: "Trader", cell: (a) => a.partyName },
  { key: "product", header: "Product", cell: (a) => a.product },
  { key: "qty", header: "Quantity", align: "right", cell: (a) => `${formatQty(a.qty)} ${a.unit}` },
  { key: "bill", header: "Bill", hideBelow: "2xl", cell: (a) => <span className="tabular-nums text-muted-foreground">{a.billNo}</span> },
];

/** The full trail for one truck: every supplier, commission agent and trader, one row per transaction. */
const trailColumns: Column<Allocation>[] = [
  { key: "at", header: "Time", cell: (a) => <span className="text-caption tabular-nums text-muted-foreground">{formatStamp(a.at)}</span> },
  { key: "no", header: "Allocation", cell: (a) => <span className="tabular-nums text-muted-foreground">{a.no}</span> },
  { key: "supplier", header: "From (supplier)", primary: true, cell: (a) => a.supplier || "—" },
  { key: "agent", header: "Commission agent", cell: (a) => a.agent },
  { key: "trader", header: "To (trader)", cell: (a) => a.partyName },
  { key: "licence", header: "Trader licence", hideBelow: "lg", cell: (a) => <span className="tabular-nums text-muted-foreground">{a.traderLicence || "—"}</span> },
  { key: "product", header: "Product", cell: (a) => a.product },
  { key: "qty", header: "Quantity", align: "right", cell: (a) => `${formatQty(a.qty)} ${a.unit}` },
  { key: "bill", header: "Bill no", cell: (a) => <span className="tabular-nums text-muted-foreground">{a.billNo}</span> },
];

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="text-[15px] wrap-break-word text-foreground">{value || "—"}</dd>
    </div>
  );
}

/** Groups transactions by one key and totals them, for the "who" summaries. */
function group(rows: Allocation[], key: (a: Allocation) => string) {
  const map = new Map<string, Allocation[]>();
  for (const a of rows) map.set(key(a), [...(map.get(key(a)) ?? []), a]);
  return [...map.entries()].map(([name, list]) => ({ name, list }));
}

function Summary({
  title,
  groups,
  line,
}: {
  title: string;
  groups: { name: string; list: Allocation[] }[];
  line: (list: Allocation[]) => string;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-3 rounded-card border border-border p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[15px] text-foreground">{title}</h3>
        <span className="text-caption tabular-nums text-muted-foreground">{groups.length}</span>
      </div>
      <ul className="flex flex-col">
        {groups.map((g) => (
          <li key={g.name} className="flex flex-col border-b border-border py-2 last:border-b-0">
            <span className="text-[15px] text-foreground">{g.name || "—"}</span>
            <span className="text-caption text-muted-foreground">{line(g.list)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const unitTotal = (list: Allocation[]) => {
  const t: Record<string, number> = {};
  for (const a of list) t[a.unit] = (t[a.unit] ?? 0) + a.qty;
  return Object.entries(t)
    .map(([u, n]) => `${formatQty(n)} ${u}`)
    .join(" + ");
};

/** Full-width record for one scanned truck. */
function TruckTrail({ result, onBack }: { result: Exclude<ScanLookup, { kind: "none" }>; onBack: () => void }) {
  const m = result.movement;
  const rows = [...getVehicleAllocations(m.id)].sort((a, b) => a.at - b.at);
  const agents = group(rows, (a) => a.agent);
  const traders = group(rows, (a) => a.partyName);
  const suppliers = group(rows, (a) => a.supplier);

  return (
    <Card className="animate-in gap-0 p-0 fade-in slide-in-from-bottom-2 duration-300 [--card-spacing:--spacing(6)]">
      <div className="flex flex-col gap-8 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-heading-lg break-all text-foreground">{m.plate || "No plate"}</p>
            <p className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
              Entry {m.entryNo}
              <StatusPill movement={m} />
            </p>
          </div>
          <Button variant="outline" size="lg" onClick={onBack}>
            <ScanLineIcon aria-hidden="true" />
            Scan another truck
          </Button>
        </div>

        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Driver" value={m.driverName} />
          <Fact label="Transporter" value={m.transporter} />
          <Fact label="Vehicle type" value={m.vehicleType} />
          <Fact label="Purpose" value={m.purpose} />
          <Fact label="Entry time" value={<span className="tabular-nums">{m.entryAt ? formatStamp(m.entryAt) : "—"}</span>} />
          <Fact
            label="Exit time"
            value={<span className="tabular-nums">{m.exitAt ? `${formatDate(m.exitAt)}, ${formatTime(m.exitAt)}` : "Still inside"}</span>}
          />
          <Fact label="Transactions" value={<span className="tabular-nums">{rows.length}</span>} />
          <Fact label="Goods given out" value={<span className="tabular-nums">{rows.length ? unitTotal(rows) : "—"}</span>} />
        </dl>

        {rows.length === 0 ? (
          <div role="status" className="flex items-start gap-2 rounded-card border border-border bg-muted p-4 text-[15px] text-foreground">
            <InfoIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
            No goods transactions have been recorded for this truck yet.
          </div>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-3">
              <Summary
                title="Suppliers (from)"
                groups={suppliers}
                line={(l) => `${[...new Set(l.map((a) => a.origin).filter(Boolean))].join(", ") || "Origin not noted"} · ${unitTotal(l)} ${[...new Set(l.map((a) => a.product))].join(", ")}`}
              />
              <Summary
                title="Commission agents"
                groups={agents}
                line={(l) => `${l.length} ${l.length === 1 ? "transaction" : "transactions"} · ${new Set(l.map((a) => a.partyId)).size} ${new Set(l.map((a) => a.partyId)).size === 1 ? "trader" : "traders"} · ${unitTotal(l)}`}
              />
              <Summary
                title="Traders (to)"
                groups={traders}
                line={(l) => `${unitTotal(l)} ${[...new Set(l.map((a) => a.product))].join(", ")} · from ${[...new Set(l.map((a) => a.agent))].join(", ")}`}
              />
            </div>

            <section aria-label="Every transaction" className="flex flex-col gap-3">
              <h3 className="text-heading-md text-foreground">Every transaction</h3>
              <DataTable id="trail" caption="Transactions for this truck" columns={trailColumns} rows={rows} rowKey={(a) => a.id} minWidth={900} />
            </section>
          </>
        )}
      </div>
    </Card>
  );
}

export function TracePage() {
  const scanRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<View>("scan");
  const [code, setCode] = useState("");
  const [looking, setLooking] = useState(false);
  const [result, setResult] = useState<ScanLookup | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const inside = useLiveQuery("tr-inside", (a) => getInside({ forceError: a === 0 && forcedErrors().has("inside") }));
  const list = useLiveQuery("tr-list", (a) => getAllocations({ forceError: a === 0 && forcedErrors().has("allocations") }));
  const insideList = inside.status === "ready" ? inside.data : [];
  const rows = list.status === "ready" ? list.data : [];

  const run = async (raw: string) => {
    if (!raw.trim() || looking) return;
    setLooking(true);
    setResult(null);
    const found = await lookupScan(raw);
    setLooking(false);
    setResult(found);
    setCode("");
  };

  useEffect(() => {
    const t = setTimeout(() => scanRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  const scanAnother = () => {
    setResult(null);
    setCode("");
    setView("scan");
    setTimeout(() => scanRef.current?.focus(), 60);
  };
  useHotkey("/", () => {
    if (!result || result.kind === "none") {
      setView("scan");
      setTimeout(() => scanRef.current?.focus(), 60);
    }
  });

  // Demo: a truck that has goods given out, so there is something to trace.
  const demoScan = () => {
    const withGoods = rows.find((a) => insideList.some((m) => m.id === a.movementId));
    const m = withGoods ? insideList.find((x) => x.id === withGoods.movementId) : insideList[0];
    if (m) void run(qrPayload(m));
  };

  const found = result && result.kind !== "none" ? result : null;

  return (
    <div className="flex flex-col gap-8 lg:gap-10">
      <PageHeader
        title="Trace Truck"
        description="Scan a truck's QR code to see which commission agents gave its goods to which traders."
        actions={
          <Segmented
            label="Trace view"
            value={view}
            onChange={(v) => (v === "scan" ? scanAnother() : setView("list"))}
            options={[
              { value: "scan", label: "Scan QR" },
              { value: "list", label: list.status === "ready" ? `All transactions (${rows.length})` : "All transactions" },
            ]}
          />
        }
      />

      <div hidden={view !== "scan"} className="flex flex-col gap-6">
        {found ? (
          <TruckTrail key={found.movement.id} result={found} onBack={scanAnother} />
        ) : (
          <Card className="mx-auto w-full max-w-220 animate-in gap-0 p-0 fade-in slide-in-from-bottom-2 duration-300 [--card-spacing:--spacing(6)]">
            <div className="flex flex-col gap-6 p-6">
              <div className="flex flex-col gap-1">
                <h2 className="text-heading-md text-foreground">Scan the truck</h2>
                <p className="text-sm text-muted-foreground">Scan the entry QR code, or type the entry number, plate or FASTag.</p>
              </div>
              <QrScanner onScan={(text) => void run(text)} disabled={looking} />
              <form
                className="flex flex-col gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(code);
                }}
              >
                <label htmlFor="tr-scan" className="text-sm text-foreground">
                  Scanner field
                </label>
                <div className="relative">
                  <ScanLineIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="tr-scan"
                    ref={scanRef}
                    data-page-search
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="Scan with the handheld scanner, or type the entry number or plate"
                    title="Scan (/)"
                    aria-keyshortcuts="/"
                    className="h-12 pr-12 pl-10"
                  />
                  {looking && <Spinner className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground" />}
                </div>
                <p className="text-caption text-muted-foreground">A handheld scanner types the code here and presses Enter.</p>
              </form>

              {looking && (
                <div role="status" aria-label="Looking up the truck" className="flex flex-col gap-3">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-full" />
                </div>
              )}

              {result?.kind === "none" && (
                <div role="status" className="flex items-start gap-2 rounded-card border border-border bg-muted p-4 text-[15px] text-foreground">
                  <InfoIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
                  No truck found for {result.code}. Check the code and scan again.
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
                <Button type="button" variant="ghost" onClick={demoScan} disabled={looking || insideList.length === 0}>
                  <QrCodeIcon aria-hidden="true" />
                  Demo: scan a vehicle that is inside
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>

      {view === "list" && (
        <Card className="animate-in gap-4 fade-in slide-in-from-bottom-2 duration-300">
          <CardHeader>
            <CardTitle className="text-heading-md">All transactions</CardTitle>
            <CardDescription>Goods given to traders by commission agents, latest first</CardDescription>
          </CardHeader>
          <div className="px-(--card-spacing)">
            {list.status === "loading" && (
              <div className={BODY} role="status" aria-label="Loading transactions">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex h-14 items-center gap-4">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                ))}
              </div>
            )}
            {list.status === "error" && <BlockError onRetry={list.retry} className={BODY} />}
            {list.status === "ready" && rows.length === 0 && (
              <BlockEmpty icon={SearchCheckIcon} text="No transactions yet." actionLabel="Scan a truck" onAction={scanAnother} className={BODY} />
            )}
            {list.status === "ready" && rows.length > 0 && (
              <DataTable
                id="tr"
                caption="Goods given to traders"
                columns={listColumns}
                rows={rows}
                rowKey={(a) => a.id}
                pageSize={10}
                minWidth={760}
                actionLabel={(a) => `Actions for ${a.no}`}
                actions={(a) => [{ label: "View", icon: EyeIcon, onSelect: () => setOpenId(a.id) }]}
              />
            )}
          </div>
        </Card>
      )}

      <AllocationDialog id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
