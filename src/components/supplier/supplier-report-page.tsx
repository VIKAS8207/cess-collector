"use client";

import { useState } from "react";
import { CalendarIcon, DownloadIcon, FileBarChartIcon, PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { SelectField } from "@/components/ui/select-field";
import { Skeleton } from "@/components/ui/skeleton";
import { TextField } from "@/components/auth/text-field";
import { BlockEmpty, BlockError } from "@/components/dashboard/block-states";
import { BarChart } from "@/components/gate/bar-chart";
import { PageHeader } from "@/components/gate/page-header";
import { PrintBusiness } from "@/components/gate/print-business";
import { useSupplier } from "@/components/supplier/use-supplier";
import { getSupplierReport, type SupplierReport } from "@/lib/api/dispatch";
import { gateStateLabel, hasArrived, type GateState } from "@/lib/domain/dispatch-store";
import { describeRange, resolveRange, toDayInput, type RangePreset } from "@/lib/domain/range";
import { activeGate } from "@/lib/domain/settings";
import { formatInr, formatNumber, formatQty, formatStamp } from "@/lib/format";
import { useLiveQuery } from "@/hooks/use-live-query";
import { useNow } from "@/hooks/use-now";

type Preset = RangePreset | "all";

const presetOptions = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom range" },
];

const stateOptions = [
  { value: "", label: "All statuses" },
  ...(["expected", "inside", "weighed", "left", "not_reached"] as GateState[]).map((s) => ({ value: s, label: gateStateLabel[s] })),
];

const BODY = "min-h-[480px]";
const SIZE = 25;
const grid = "grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr))]";

const esc = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function download(name: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map(esc).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function csvFor(d: SupplierReport): (string | number)[][] {
  return [
    ["Dispatch", "Registered", "Vehicle", "Driver", "Driver mobile", "Goods", "Quantity", "Unit", "Cost", "Gate status", "Entry no", "Scanned at gate", "Net weight (kg)"],
    ...d.rows.map((r) => [
      r.no,
      formatStamp(r.createdAt),
      r.plate,
      r.driverName,
      r.driverPhone,
      r.commodity,
      r.quantity,
      r.unit,
      r.value,
      gateStateLabel[r.gate.state],
      r.gate.entryNo ?? "",
      r.gate.entryAt ? formatStamp(r.gate.entryAt) : "",
      r.gate.netKg ?? "",
    ]),
    ["Total", "", "", "", "", "", "", "", d.summary.value],
  ];
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

const qtyText = (q: { unit: string; qty: number }[]) => (q.length ? q.map((x) => `${formatQty(x.qty)} ${x.unit}`).join(" · ") : "—");

function Body({ data }: { data: SupplierReport }) {
  const [page, setPage] = useState(1);
  const s = data.summary;
  const pages = Math.max(1, Math.ceil(data.rows.length / SIZE));
  const p = Math.min(page, pages);
  const reachedPct = s.total ? Math.round((s.reached / s.total) * 100) : 0;

  return (
    <div className="flex flex-col gap-8">
      <dl className={grid}>
        <Stat label="Trucks sent" value={formatNumber(s.total)} note={qtyText(s.quantity)} />
        <Stat label="Reached the gate" value={formatNumber(s.reached)} note={`${reachedPct}% of trucks`} />
        <Stat label="Not reached" value={formatNumber(s.notReached)} note={`${s.onTheWay} still on the way`} />
        <Stat label="Total cost sent" value={formatInr(s.value)} />
        <Stat label="Cost that reached" value={formatInr(s.valueReached)} />
      </dl>

      {data.byDay.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-heading-md">Cost sent per day</CardTitle>
            <CardDescription>Amount in ₹ thousands</CardDescription>
          </CardHeader>
          <div className="px-(--card-spacing)">
            <BarChart
              labels={data.byDay.map((d) => d.label)}
              height={220}
              labelEvery={data.byDay.length > 12 ? 5 : 1}
              format={(n) => `${formatQty(n)}k`}
              summary={`Total cost sent ${formatInr(s.value)} over ${data.byDay.length} days.`}
              series={[{ name: "Cost sent (₹ thousand)", values: data.byDay.map((d) => Math.round(d.value / 100) / 10), className: "fill-primary" }]}
            />
          </div>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-heading-md">By goods</CardTitle>
          <CardDescription>What you sent, and how much of it reached the gate</CardDescription>
        </CardHeader>
        <div className="overflow-x-auto px-(--card-spacing)">
          <table className="w-full min-w-[420px] text-[15px]">
            <caption className="sr-only">Dispatches by goods</caption>
            <thead>
              <tr className="h-10 border-b border-border text-left text-caption text-muted-foreground">
                <th scope="col" className="font-normal">Goods</th>
                <th scope="col" className="text-right font-normal">Trucks</th>
                <th scope="col" className="text-right font-normal">Reached</th>
                <th scope="col" className="hidden text-right font-normal sm:table-cell">Quantity</th>
                <th scope="col" className="text-right font-normal">Cost</th>
              </tr>
            </thead>
            <tbody>
              {data.byGoods.map((g) => (
                <tr key={g.commodity} className="h-12 border-b border-border">
                  <th scope="row" className="text-left font-normal">{g.commodity}</th>
                  <td className="text-right tabular-nums">{g.trucks}</td>
                  <td className="text-right tabular-nums">{g.reached}</td>
                  <td className="hidden text-right text-caption tabular-nums text-muted-foreground sm:table-cell">{qtyText(g.quantity)}</td>
                  <td className="text-right tabular-nums">{formatInr(g.value)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="h-12">
                <th scope="row" className="text-left font-normal">Total</th>
                <td className="text-right tabular-nums">{s.total}</td>
                <td className="text-right tabular-nums">{s.reached}</td>
                <td className="hidden sm:table-cell" />
                <td className="text-right tabular-nums">{formatInr(s.value)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <div className="@container overflow-x-auto">
        <table className="w-full min-w-[520px] text-[15px]">
          <caption className="mb-2 text-left text-heading-md text-foreground">Dispatches</caption>
          <thead>
            <tr className="h-10 border-b border-border text-left text-caption text-muted-foreground">
              <th scope="col" className="font-normal">Vehicle</th>
              <th scope="col" className="hidden font-normal @xl:table-cell">Driver</th>
              <th scope="col" className="font-normal">Goods</th>
              <th scope="col" className="text-right font-normal">Cost</th>
              <th scope="col" className="pl-4 font-normal">Gate status</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.slice((p - 1) * SIZE, p * SIZE).map((r) => (
              <tr key={r.id} className="border-b border-border align-top">
                <th scope="row" className="py-3 pr-3 text-left font-normal">
                  {r.plate}
                  <span className="block text-caption tabular-nums text-muted-foreground">{r.no} · {formatStamp(r.createdAt)}</span>
                </th>
                <td className="hidden py-3 pr-3 @xl:table-cell">{r.driverName}</td>
                <td className="py-3 pr-3">
                  {r.commodity}
                  <span className="block text-caption tabular-nums text-muted-foreground">{formatQty(r.quantity)} {r.unit}</span>
                </td>
                <td className="py-3 text-right tabular-nums">{formatInr(r.value)}</td>
                <td className="py-3 pl-4">
                  <Pill tone={r.gate.state === "not_reached" ? "danger" : hasArrived(r.gate.state) ? "brand" : "neutral"}>{gateStateLabel[r.gate.state]}</Pill>
                  {r.gate.entryAt ? <span className="block text-caption tabular-nums text-muted-foreground">{formatStamp(r.gate.entryAt)}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="h-12">
              <th scope="row" colSpan={3} className="hidden text-left font-normal @xl:table-cell">Total</th>
              <th scope="row" colSpan={2} className="text-left font-normal @xl:hidden">Total</th>
              <td className="text-right tabular-nums">{formatInr(s.value)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {pages > 1 && (
        <div data-print-hide className="flex items-center justify-end gap-3">
          <Button variant="outline" disabled={p <= 1} onClick={() => setPage(p - 1)}>Previous</Button>
          <span className="text-sm tabular-nums text-muted-foreground">Page {p} of {pages}</span>
          <Button variant="outline" disabled={p >= pages} onClick={() => setPage(p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}

/** The supplier's report: what was sent in a period, what it cost, and what reached the gate. */
export function SupplierReportPage() {
  const { user, supplier } = useSupplier();
  const now = useNow(60_000);
  const [preset, setPreset] = useState<Preset>("30d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [state, setState] = useState<GateState | "">("");

  const range = preset === "all" ? { from: 0, to: Number.MAX_SAFE_INTEGER } : resolveRange(preset, now || Date.now(), { from, to });
  const key = `${preset}|${from}|${to}|${state}`;
  const query = useLiveQuery(`sup-rep:${supplier?.id ?? ""}:${key}`, () =>
    supplier ? getSupplierReport(supplier, { ...range, state }) : Promise.reject(new Error("No supplier"))
  );

  const rangeText = preset === "all" ? "All time" : describeRange(range);
  const empty = query.status === "ready" && query.data.rows.length === 0;

  return (
    <div className="flex flex-col gap-8 lg:gap-10">
      <div className="hidden print:block">
        <PrintBusiness />
        <h1 className="text-display-md">Supplier report: {supplier?.name}</h1>
        <p className="text-sm">{rangeText} · {activeGate()} · Generated by {user?.name}</p>
      </div>

      <div data-print-hide>
        <PageHeader
          title="Report"
          description="What you sent, what it cost, and which trucks reached the gate."
          actions={
            <>
              <Button variant="outline" onClick={() => window.print()} disabled={query.status !== "ready"}>
                <PrinterIcon aria-hidden="true" />
                Print
              </Button>
              <Button
                onClick={() => query.status === "ready" && download(`supplier-report-${toDayInput(Date.now())}.csv`, csvFor(query.data))}
                disabled={query.status !== "ready" || empty}
              >
                <DownloadIcon aria-hidden="true" />
                Export CSV
              </Button>
            </>
          }
        />
      </div>

      <Card data-print-hide className="gap-4">
        <div className="grid grid-cols-1 gap-4 px-(--card-spacing) sm:grid-cols-2 xl:grid-cols-4">
          <SelectField id="sr-range" label="Date range" icon={<CalendarIcon aria-hidden="true" />} value={preset} onChange={(v) => setPreset(v as Preset)} options={presetOptions} />
          <SelectField id="sr-state" label="Gate status" value={state} onChange={(v) => setState(v as GateState | "")} options={stateOptions} />
          {preset === "custom" && (
            <>
              <TextField id="sr-from" label="From" type="date" value={from || toDayInput((now || Date.now()) - 6 * 86_400_000)} onChange={setFrom} />
              <TextField id="sr-to" label="To" type="date" value={to || toDayInput(now || Date.now())} onChange={setTo} />
            </>
          )}
        </div>
      </Card>

      <section aria-label="Supplier report">
        {query.status === "loading" && (
          <div className={BODY} role="status" aria-label="Loading report">
            <div className={grid}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 rounded-card" />
              ))}
            </div>
            <Skeleton className="mt-6 h-72 w-full rounded-card" />
          </div>
        )}
        {query.status === "error" && (
          <Card className={BODY}>
            <BlockError onRetry={query.retry} className="h-full min-h-[480px]" />
          </Card>
        )}
        {empty && (
          <Card className={BODY}>
            <BlockEmpty icon={FileBarChartIcon} text="No dispatches in this range." actionLabel="Show all time" onAction={() => { setPreset("all"); setState(""); }} className="h-full min-h-[480px]" />
          </Card>
        )}
        {query.status === "ready" && !empty && <Body key={key} data={query.data} />}
      </section>
    </div>
  );
}
