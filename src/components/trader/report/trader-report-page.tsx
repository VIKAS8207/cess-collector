"use client";

import { useState } from "react";
import { PrintBusiness } from "@/components/gate/print-business";
import { CalendarIcon, DownloadIcon, FileBarChartIcon, PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { SelectField } from "@/components/ui/select-field";
import { Skeleton } from "@/components/ui/skeleton";
import { TextField } from "@/components/auth/text-field";
import { BlockEmpty, BlockError } from "@/components/dashboard/block-states";
import { BarChart, Legend } from "@/components/gate/bar-chart";
import { PageHeader } from "@/components/gate/page-header";
import { CessBasis } from "@/components/trader/pills";
import { downloadCsv } from "@/components/trader/collections/buyer-drawer";
import { useAuth } from "@/lib/auth-store";
import { getTraderReport, listBuyers, type TraderReportData, type TraderReportKind } from "@/lib/api/trader";
import { forcedErrors } from "@/lib/api/gate";
import { describeRange, resolveRange, toDayInput, type RangePreset } from "@/lib/domain/range";
import { describeCess } from "@/lib/domain/trader-math";
import { cessConfig } from "@/lib/domain/trader-store";
import { CESS_LABEL } from "@/lib/domain/trader-types";
import { formatCompactInr, formatInr, formatQty, formatStamp } from "@/lib/format";
import { useLiveQuery } from "@/hooks/use-live-query";
import { useHotkey } from "@/hooks/use-hotkey";
import { useNow } from "@/hooks/use-now";
import { cn } from "cn";

const tabs: { id: TraderReportKind; label: string }[] = [
  { id: "purchase-sale", label: "Purchase vs Sale" },
  { id: "cess", label: "CESS" },
  { id: "balances", label: "Buyer balances" },
  { id: "stock", label: "Stock" },
];

const presetOptions = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "custom", label: "Custom range" },
];

const statusFor: Record<TraderReportKind, { value: string; label: string }[]> = {
  "purchase-sale": [],
  cess: [{ value: "", label: "All" }, { value: "Unpaid", label: "Unpaid" }, { value: "Partly paid", label: "Partly paid" }, { value: "Paid", label: "Paid" }],
  balances: [{ value: "", label: "All" }, { value: "Paid", label: "Paid" }, { value: "Overdue", label: "Overdue" }, { value: "Partial", label: "Partial" }],
  stock: [{ value: "", label: "All" }, { value: "Remaining", label: "Remaining" }, { value: "Fully sold", label: "Fully sold" }, { value: "Wastage", label: "Wastage" }],
};

const BODY = "min-h-[480px]";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-card border border-border bg-background p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-display-md tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

function HBars({ title, description, items, summary }: { title: string; description?: string; items: { label: string; value: number }[]; summary: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-heading-md">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <ul className="flex flex-col gap-4 px-(--card-spacing)" aria-label={summary}>
        {items.map((i) => (
          <li key={i.label} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate text-foreground">{i.label}</span>
              <span className="shrink-0 tabular-nums text-foreground">{formatInr(i.value)}</span>
            </div>
            <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${(i.value / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function csvFor(d: TraderReportData): (string | number)[][] {
  if (d.kind === "purchase-sale")
    return [
      ["Item", "Unit", "Purchased qty", "Sold qty", "Returned qty", "Wastage qty", "Stock left", "Value purchased", "Value sold", "Margin"],
      ...d.items.map((i) => [i.item, i.unit, i.purchased, i.sold, i.returned, i.wastage, i.left, i.valuePurchased, i.valueSold, Math.round(i.margin)]),
    ];
  if (d.kind === "cess")
    return [
      ["Buyer", "CESS computed", "CESS collected", "CESS pending"],
      ...d.buyers.map((b) => [b.buyer.name, b.computed, b.collected, b.pending]),
      ["Total", d.totals.computed, d.totals.collected, d.totals.pending],
    ];
  if (d.kind === "balances")
    return [
      ["Buyer", "Opening", "Bills", "Returns", "Payments", "Closing goods", "Closing CESS", "Closing total", "Overdue"],
      ...d.rows.map((r) => [r.buyer.name, r.opening, r.bills, r.returns, r.payments, r.goodsClosing, r.cessClosing, r.closing, r.overdue ? "Yes" : "No"]),
    ];
  return [
    ["Item", "Unit", "Remaining", "Purchase rate", "Value", "Age (days)", "Flags"],
    ...d.rows.map((r) => [r.line.item, r.line.unit, r.line.remaining, r.line.rate, r.value, r.ageDays, r.flags.join(" ")]),
  ];
}

function Body({ data }: { data: TraderReportData }) {
  if (data.kind === "purchase-sale") {
    const days = data.days;
    return (
      <div className="flex flex-col gap-8">
        <dl className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr))]">
          <Stat label="Value purchased" value={formatInr(data.totals.purchased)} />
          <Stat label="Value sold" value={formatInr(data.totals.sold)} />
          <Stat label="Margin on sold goods" value={formatInr(Math.round(data.totals.margin))} />
        </dl>
        {days.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-heading-md">Purchased and sold per day</CardTitle>
              <CardDescription>Value in ₹</CardDescription>
            </CardHeader>
            <div className="flex flex-col gap-3 px-(--card-spacing)">
              <Legend items={[{ label: "Purchased", className: "bg-tag" }, { label: "Sold", className: "bg-primary" }]} />
              <BarChart
                labels={days.map((d) => d.label)}
                height={220}
                axisWidth={52}
                labelEvery={days.length > 12 ? 5 : 1}
                format={formatCompactInr}
                summary={`Purchased ${formatInr(data.totals.purchased)} and sold ${formatInr(data.totals.sold)}.`}
                series={[
                  { name: "Purchased", values: days.map((d) => d.purchased), className: "fill-tag" },
                  { name: "Sold", values: days.map((d) => d.sold), className: "fill-primary" },
                ]}
              />
            </div>
          </Card>
        )}
        <div className="@container overflow-x-auto">
          <table className="w-full min-w-[560px] text-[15px]">
            <caption className="sr-only">Purchase versus sale by item</caption>
            <thead>
              <tr className="h-10 border-b border-border text-left text-caption text-muted-foreground">
                <th scope="col" className="font-normal">Item</th>
                <th scope="col" className="text-right font-normal">Purchased</th>
                <th scope="col" className="text-right font-normal">Sold</th>
                <th scope="col" className="hidden text-right font-normal @xl:table-cell">Returned</th>
                <th scope="col" className="hidden text-right font-normal @xl:table-cell">Wastage</th>
                <th scope="col" className="text-right font-normal">Left</th>
                <th scope="col" className="hidden text-right font-normal @2xl:table-cell">Value sold</th>
                <th scope="col" className="hidden text-right font-normal @2xl:table-cell">Margin</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((i) => (
                <tr key={`${i.item}${i.unit}`} className="h-12 border-b border-border">
                  <th scope="row" className="text-left font-normal">{i.item}<span className="block text-caption text-muted-foreground">{i.unit}</span></th>
                  <td className="text-right tabular-nums">{formatQty(i.purchased)} {i.unit}</td>
                  <td className="text-right tabular-nums">{formatQty(i.sold)} {i.unit}</td>
                  <td className="hidden text-right tabular-nums @xl:table-cell">{formatQty(i.returned)} {i.unit}</td>
                  <td className="hidden text-right tabular-nums @xl:table-cell">{formatQty(i.wastage)} {i.unit}</td>
                  <td className="text-right tabular-nums">{formatQty(i.left)} {i.unit}</td>
                  <td className="hidden text-right tabular-nums @2xl:table-cell">{formatInr(i.valueSold)}</td>
                  <td className="hidden text-right tabular-nums @2xl:table-cell">{formatInr(Math.round(i.margin))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (data.kind === "cess") {
    return (
      <div className="flex flex-col gap-8">
        <p className="text-sm text-muted-foreground">Rate basis: {data.rateNote}</p>
        <dl className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr))]">
          <Stat label={`${CESS_LABEL} computed`} value={formatInr(data.totals.computed)} />
          <Stat label={`${CESS_LABEL} collected`} value={formatInr(data.totals.collected)} />
          <Stat label={`${CESS_LABEL} pending`} value={formatInr(data.totals.pending)} />
        </dl>
        {data.days.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-heading-md">CESS per day</CardTitle>
              <CardDescription>Computed on bills and collected with payments</CardDescription>
            </CardHeader>
            <div className="flex flex-col gap-3 px-(--card-spacing)">
              <Legend items={[{ label: "Computed", className: "bg-primary" }, { label: "Collected", className: "bg-tag" }]} />
              <BarChart
                labels={data.days.map((d) => d.label)}
                height={200}
                axisWidth={52}
                labelEvery={data.days.length > 12 ? 5 : 1}
                format={formatCompactInr}
                summary={`CESS computed ${formatInr(data.totals.computed)}, collected ${formatInr(data.totals.collected)}.`}
                series={[
                  { name: "Computed", values: data.days.map((d) => d.computed), className: "fill-primary" },
                  { name: "Collected", values: data.days.map((d) => d.collected), className: "fill-tag" },
                ]}
              />
            </div>
          </Card>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-[15px]">
            <caption className="sr-only">CESS by buyer</caption>
            <thead>
              <tr className="h-10 border-b border-border text-left text-caption text-muted-foreground">
                <th scope="col" className="font-normal">Buyer</th>
                <th scope="col" className="text-right font-normal">Computed</th>
                <th scope="col" className="text-right font-normal">Collected</th>
                <th scope="col" className="text-right font-normal">Pending</th>
              </tr>
            </thead>
            <tbody>
              {data.buyers.map((b) => (
                <tr key={b.buyer.id} className="h-12 border-b border-border">
                  <th scope="row" className="text-left font-normal">{b.buyer.name}</th>
                  <td className="text-right tabular-nums">{formatInr(b.computed)}</td>
                  <td className="text-right tabular-nums">{formatInr(b.collected)}</td>
                  <td className="text-right tabular-nums">{formatInr(b.pending)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="h-12">
                <th scope="row" className="text-left font-normal">Total</th>
                <td className="text-right tabular-nums">{formatInr(data.totals.computed)}</td>
                <td className="text-right tabular-nums">{formatInr(data.totals.collected)}</td>
                <td className="text-right tabular-nums">{formatInr(data.totals.pending)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  }

  if (data.kind === "balances") {
    const totalClosing = data.rows.reduce((a, r) => a + r.closing, 0);
    return (
      <div className="flex flex-col gap-8">
        <HBars
          title="Dues by buyer"
          description="Closing balance, goods plus CESS"
          items={data.rows.filter((r) => r.closing > 0).map((r) => ({ label: r.buyer.name, value: r.closing }))}
          summary={`Total due ${formatInr(totalClosing)} across ${data.rows.filter((r) => r.closing > 0).length} buyers.`}
        />
        <div className="@container overflow-x-auto">
          <table className="w-full min-w-[560px] text-[15px]">
            <caption className="sr-only">Buyer balances</caption>
            <thead>
              <tr className="h-10 border-b border-border text-left text-caption text-muted-foreground">
                <th scope="col" className="font-normal">Buyer</th>
                <th scope="col" className="hidden text-right font-normal @xl:table-cell">Opening</th>
                <th scope="col" className="hidden text-right font-normal @xl:table-cell">Bills</th>
                <th scope="col" className="hidden text-right font-normal @2xl:table-cell">Returns</th>
                <th scope="col" className="hidden text-right font-normal @2xl:table-cell">Payments</th>
                <th scope="col" className="text-right font-normal">Goods</th>
                <th scope="col" className="text-right font-normal">CESS</th>
                <th scope="col" className="text-right font-normal">Closing</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.buyer.id} className="h-12 border-b border-border">
                  <th scope="row" className="text-left font-normal">
                    {r.buyer.name} {r.overdue && <Pill tone="danger" className="ml-2">Overdue</Pill>}
                  </th>
                  <td className="hidden text-right tabular-nums @xl:table-cell">{formatInr(r.opening)}</td>
                  <td className="hidden text-right tabular-nums @xl:table-cell">{formatInr(r.bills)}</td>
                  <td className="hidden text-right tabular-nums @2xl:table-cell">{formatInr(r.returns)}</td>
                  <td className="hidden text-right tabular-nums @2xl:table-cell">{formatInr(r.payments)}</td>
                  <td className="text-right tabular-nums">{formatInr(r.goodsClosing)}</td>
                  <td className="text-right tabular-nums">{formatInr(r.cessClosing)}</td>
                  <td className="text-right tabular-nums text-foreground">{formatInr(r.closing)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="h-12">
                <th scope="row" className="text-left font-normal">Total</th>
                <td colSpan={7} className="text-right tabular-nums">{formatInr(totalClosing)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <dl className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr))]">
        <Stat label="Stock value at purchase rate" value={formatInr(data.totalValue)} />
        <Stat label="Lines" value={String(data.rows.length)} />
      </dl>
      <div className="@container overflow-x-auto">
        <table className="w-full min-w-[480px] text-[15px]">
          <caption className="sr-only">Stock report</caption>
          <thead>
            <tr className="h-10 border-b border-border text-left text-caption text-muted-foreground">
              <th scope="col" className="font-normal">Item</th>
              <th scope="col" className="text-right font-normal">Remaining</th>
              <th scope="col" className="hidden text-right font-normal @xl:table-cell">Rate</th>
              <th scope="col" className="text-right font-normal">Value</th>
              <th scope="col" className="text-right font-normal">Age</th>
              <th scope="col" className="pl-4 font-normal">Flags</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.line.id} className="h-12 border-b border-border">
                <th scope="row" className="text-left font-normal">{r.line.item}<span className="block text-caption text-muted-foreground">{r.line.unit}</span></th>
                <td className="text-right tabular-nums">{formatQty(r.line.remaining)} {r.line.unit}</td>
                <td className="hidden text-right tabular-nums @xl:table-cell">{formatInr(r.line.rate)}</td>
                <td className="text-right tabular-nums">{formatInr(r.value)}</td>
                <td className="text-right tabular-nums">{r.ageDays} days</td>
                <td className="pl-4">
                  <span className="flex flex-wrap gap-1.5">
                    {r.line.remaining > 0 ? <Pill tone="brand">Remaining</Pill> : <Pill tone="neutral">Fully sold</Pill>}
                    {r.flags.map((f) => <Pill key={f} tone={f === "Wastage" ? "danger" : "neutral"}>{f}</Pill>)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function TraderReportPage() {
  const { user } = useAuth();
  const now = useNow(60_000);
  const [tab, setTab] = useState<TraderReportKind>("purchase-sale");
  const [preset, setPreset] = useState<RangePreset>("30d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [buyerId, setBuyerId] = useState("");
  const [item, setItem] = useState("");
  const [status, setStatus] = useState("");

  const key = `${preset}|${from}|${to}|${buyerId}|${item}|${status}`;
  const query = useLiveQuery(`tr:${tab}:${key}`, (a) =>
    getTraderReport(
      tab,
      { range: resolveRange(preset, Date.now(), { from, to }), buyerId: buyerId || undefined, item, status: status || undefined },
      describeCess(cessConfig()),
      { forceError: a === 0 && forcedErrors().has("report") }
    )
  );
  useHotkey("/", () => document.getElementById("tr-item")?.focus());

  const rangeText = describeRange(resolveRange(preset, now, { from, to }));
  const tabLabel = tabs.find((t) => t.id === tab)?.label ?? "";
  const empty =
    query.status === "ready" &&
    ((query.data.kind === "purchase-sale" && query.data.items.length === 0) ||
      (query.data.kind === "cess" && query.data.buyers.length === 0) ||
      (query.data.kind === "balances" && query.data.rows.length === 0) ||
      (query.data.kind === "stock" && query.data.rows.length === 0));
  const statuses = statusFor[tab];

  return (
    <div className="flex flex-col gap-8 lg:gap-10">
      <div className="hidden print:block">
        <PrintBusiness />
        <h1 className="text-display-md">Trader report: {tabLabel}</h1>
        <p className="text-sm">
          {rangeText} · Generated by {user?.name} on {formatStamp(now)} · <CessBasis />
        </p>
      </div>

      <div data-print-hide>
        <PageHeader
          title="Report"
          description="Purchases and sales, CESS, buyer balances and stock."
          actions={
            <>
              <Button variant="outline" onClick={() => window.print()} disabled={query.status !== "ready"}>
                <PrinterIcon aria-hidden="true" />
                Print
              </Button>
              <Button onClick={() => query.status === "ready" && downloadCsv(`trader-report-${tab}-${toDayInput(Date.now())}.csv`, csvFor(query.data))} disabled={query.status !== "ready" || !!empty}>
                <DownloadIcon aria-hidden="true" />
                Export CSV
              </Button>
            </>
          }
        />
      </div>

      <div data-print-hide role="tablist" aria-label="Reports" className="flex gap-1 overflow-x-auto rounded-full bg-muted p-1 sm:self-start">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            id={`ttab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls="trader-report-panel"
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => {
              setTab(t.id);
              setStatus("");
            }}
            onKeyDown={(e) => {
              const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
              if (!dir) return;
              e.preventDefault();
              const next = tabs[(i + dir + tabs.length) % tabs.length];
              setTab(next.id);
              setStatus("");
              requestAnimationFrame(() => document.getElementById(`ttab-${next.id}`)?.focus());
            }}
            className={cn(
              "h-10 shrink-0 rounded-full px-4 text-sm whitespace-nowrap outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
              tab === t.id ? "bg-background text-primary shadow-card" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card data-print-hide className="gap-4">
        <div className="grid grid-cols-1 gap-4 px-(--card-spacing) sm:grid-cols-2 xl:grid-cols-4">
          <SelectField id="tr-range" label="Date range" icon={<CalendarIcon aria-hidden="true" />} value={preset} onChange={(v) => setPreset(v as RangePreset)} options={presetOptions} />
          <SelectField id="tr-buyer" label="Buyer" value={buyerId} onChange={setBuyerId} options={[{ value: "", label: "All buyers" }, ...listBuyers().map((b) => ({ value: b.id, label: b.name }))]} disabled={tab === "stock"} />
          <TextField id="tr-item" label="Item" value={item} onChange={setItem} placeholder="Any item" autoComplete="off" disabled={tab === "balances" || tab === "cess"} data-page-search />
          {statuses.length > 0 ? (
            <SelectField id="tr-status" label="Status" value={status} onChange={setStatus} options={statuses} />
          ) : (
            <SelectField id="tr-status" label="Status" value="" onChange={() => {}} options={[{ value: "", label: "Not used here" }]} disabled />
          )}
          {preset === "custom" && (
            <>
              <TextField id="tr-from" label="From" type="date" value={from || toDayInput(now - 6 * 86_400_000)} onChange={setFrom} />
              <TextField id="tr-to" label="To" type="date" value={to || toDayInput(now)} onChange={setTo} />
            </>
          )}
        </div>
      </Card>

      <section id="trader-report-panel" role="tabpanel" aria-labelledby={`ttab-${tab}`} tabIndex={-1} className="outline-none">
        {query.status === "loading" && (
          <div className={BODY} role="status" aria-label="Loading report">
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr))]">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-card" />)}
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
            <BlockEmpty icon={FileBarChartIcon} text="No records in this range." actionLabel="Show last 30 days" onAction={() => setPreset("30d")} className="h-full min-h-[480px]" />
          </Card>
        )}
        {query.status === "ready" && !empty && <Body key={`${tab}:${key}`} data={query.data} />}
      </section>
    </div>
  );
}

