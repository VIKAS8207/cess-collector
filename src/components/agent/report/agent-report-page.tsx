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
import { BarChart } from "@/components/gate/bar-chart";
import { PageHeader } from "@/components/gate/page-header";
import { ReceiptPills } from "@/components/agent/pills";
import { useAuth } from "@/lib/auth-store";
import {
  getAgentReport,
  itemsSummary,
  listTraders,
  type AgentReportData,
  type AgentReportKind,
  type PartyRow,
} from "@/lib/api/agent";
import { forcedErrors } from "@/lib/api/gate";
import { describeRange, resolveRange, toDayInput, type RangePreset } from "@/lib/domain/range";
import { describeCommission } from "@/lib/domain/agent-math";
import { saleCommission, saleSettlement, saleTotal, receiptStatus } from "@/lib/domain/agent-store";
import { activeGate } from "@/lib/domain/settings";
import { formatInr, formatNumber, formatQty, formatStamp } from "@/lib/format";
import { useLiveQuery } from "@/hooks/use-live-query";
import { useNow } from "@/hooks/use-now";
import { cn } from "cn";

const tabs: { id: AgentReportKind; label: string }[] = [
  { id: "receipts", label: "Receipts" },
  { id: "sales", label: "Sales" },
  { id: "commission", label: "Commission" },
  { id: "balances", label: "Balances" },
];

const presetOptions = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "custom", label: "Custom range" },
];

const BODY = "min-h-[480px]";

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

function csvFor(d: AgentReportData): (string | number)[][] {
  if (d.kind === "receipts")
    return [
      ["Receipt", "Plate", "Items", "Received at", "Status", "Mismatch", "Agent"],
      ...d.rows.map((r) => [r.no, r.plate, itemsSummary(r), formatStamp(r.receivedAt), receiptStatus(r), r.mismatch ? "Yes" : "No", r.agent]),
    ];
  if (d.kind === "sales")
    return [
      ["Sale", "Date", "Receipt", "Plate", "Party", "Items", "Amount", "Commission", "Status"],
      ...d.rows.map((s) => [s.no, formatStamp(s.at), s.receiptNo, s.plate, s.partyName, s.lines.map((l) => `${l.item} ${l.qty} ${l.unit} @ ${l.rate}`).join("; "), saleTotal(s), saleCommission(s), saleSettlement(s)]),
    ];
  if (d.kind === "commission")
    return [["Trader", "Rate", "Sale value", "Commission"], ...d.rows.map((r) => [r.party.name, describeCommission(r.party.commission), r.value, r.commission])];
  return [
    ["Type", "Party", "Balance", "Overdue"],
    ...d.traders.map((r) => ["Trader (owes you)", r.party.name, r.balance, r.overdue ? "Yes" : "No"]),
    ...d.sellers.map((r) => ["Seller (you owe)", r.party.name, r.balance, "No"]),
  ];
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-card border border-border bg-background p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-display-md tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

function BalanceTable({ title, rows, owedLabel }: { title: string; rows: PartyRow[]; owedLabel: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-heading-md">{title}</CardTitle>
        <CardDescription>{owedLabel}</CardDescription>
      </CardHeader>
      <div className="overflow-x-auto px-(--card-spacing)">
        <table className="w-full min-w-[320px] text-[15px]">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr className="h-10 border-b border-border text-left text-caption text-muted-foreground">
              <th scope="col" className="font-normal">Party</th>
              <th scope="col" className="text-right font-normal">Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.party.id} className="h-12 border-b border-border">
                <th scope="row" className="text-left font-normal">
                  {r.party.name} {r.overdue && <Pill tone="danger" className="ml-2">Overdue</Pill>}
                </th>
                <td className="text-right tabular-nums">{formatInr(r.balance)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="h-12">
              <th scope="row" className="text-left font-normal">Total</th>
              <td className="text-right tabular-nums">{formatInr(rows.reduce((a, r) => a + Math.max(0, r.balance), 0))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}

function Body({ data }: { data: AgentReportData }) {
  const [page, setPage] = useState(1);
  const SIZE = 40;

  if (data.kind === "receipts") {
    const pages = Math.max(1, Math.ceil(data.rows.length / SIZE));
    const p = Math.min(page, pages);
    return (
      <div className="flex flex-col gap-8">
        <dl className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr))]">
          <Stat label="Receipts" value={formatNumber(data.rows.length)} />
          <Stat label="With mismatch" value={formatNumber(data.rows.filter((r) => r.mismatch).length)} />
        </dl>
        <Card>
          <CardHeader>
            <CardTitle className="text-heading-md">Quantity received by item</CardTitle>
          </CardHeader>
          <ul className="grid gap-3 px-(--card-spacing) sm:grid-cols-2">
            {data.byItem.map((i) => (
              <li key={`${i.item}${i.unit}`} className="flex items-baseline justify-between gap-3 border-b border-border py-2 text-[15px]">
                <span>{i.item}</span>
                <span className="tabular-nums">{formatQty(i.qty)} {i.unit}</span>
              </li>
            ))}
          </ul>
        </Card>
        <div className="@container overflow-x-auto">
          <table className="w-full min-w-[480px] text-[15px]">
            <caption className="sr-only">Receipts</caption>
            <thead>
              <tr className="h-10 border-b border-border text-left text-caption text-muted-foreground">
                <th scope="col" className="font-normal">Receipt</th>
                <th scope="col" className="font-normal">Items</th>
                <th scope="col" className="hidden font-normal @xl:table-cell">Received</th>
                <th scope="col" className="font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.slice((p - 1) * SIZE, p * SIZE).map((r) => (
                <tr key={r.id} className="border-b border-border align-top">
                  <th scope="row" className="py-3 pr-3 text-left font-normal">
                    {r.plate || "No plate"}
                    <span className="block text-caption text-muted-foreground">{r.no}</span>
                  </th>
                  <td className="py-3 pr-3 text-caption text-muted-foreground">{itemsSummary(r)}</td>
                  <td className="hidden py-3 pr-3 text-caption tabular-nums text-muted-foreground @xl:table-cell">{formatStamp(r.receivedAt)}</td>
                  <td className="py-3"><ReceiptPills receipt={r} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager page={p} pages={pages} onPage={setPage} />
      </div>
    );
  }

  if (data.kind === "sales") {
    const pages = Math.max(1, Math.ceil(data.rows.length / SIZE));
    const p = Math.min(page, pages);
    return (
      <div className="flex flex-col gap-8">
        <dl className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr))]">
          <Stat label="Sales" value={formatNumber(data.rows.length)} />
          <Stat label="Sale value" value={formatInr(data.value)} />
          <Stat label="Commission" value={formatInr(data.commission)} />
        </dl>
        {data.byDay.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-heading-md">Sale value per day</CardTitle>
              <CardDescription>Amount in ₹ thousands</CardDescription>
            </CardHeader>
            <div className="px-(--card-spacing)">
              <BarChart
                labels={data.byDay.map((d) => d.label)}
                height={220}
                labelEvery={data.byDay.length > 12 ? 5 : 1}
                format={(n) => `${formatQty(n)}k`}
                summary={`Total sale value ${formatInr(data.value)} over ${data.byDay.length} days.`}
                series={[{ name: "Sale value (₹ thousand)", values: data.byDay.map((d) => Math.round(d.value / 100) / 10), className: "fill-primary" }]}
              />
            </div>
          </Card>
        )}
        <div className="@container overflow-x-auto">
          <table className="w-full min-w-[480px] text-[15px]">
            <caption className="sr-only">Sales</caption>
            <thead>
              <tr className="h-10 border-b border-border text-left text-caption text-muted-foreground">
                <th scope="col" className="font-normal">Sale</th>
                <th scope="col" className="font-normal">Party</th>
                <th scope="col" className="text-right font-normal">Amount</th>
                <th scope="col" className="hidden text-right font-normal @xl:table-cell">Commission</th>
                <th scope="col" className="pl-4 font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.slice((p - 1) * SIZE, p * SIZE).map((s) => (
                <tr key={s.id} className="h-14 border-b border-border">
                  <th scope="row" className="py-1 pr-3 text-left font-normal">
                    {s.no}
                    <span className="block text-caption tabular-nums text-muted-foreground">{formatStamp(s.at)}</span>
                  </th>
                  <td className="max-w-40 truncate pr-3">{s.partyName}</td>
                  <td className="text-right tabular-nums">{formatInr(saleTotal(s))}</td>
                  <td className="hidden text-right tabular-nums @xl:table-cell">{formatInr(saleCommission(s))}</td>
                  <td className="pl-4"><Pill tone={saleSettlement(s) === "Collected" ? "neutral" : "brand"}>{saleSettlement(s)}</Pill></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="h-12">
                <th scope="row" colSpan={2} className="text-left font-normal">Total</th>
                <td className="text-right tabular-nums">{formatInr(data.value)}</td>
                <td className="hidden text-right tabular-nums @xl:table-cell">{formatInr(data.commission)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <Pager page={p} pages={pages} onPage={setPage} />
      </div>
    );
  }

  if (data.kind === "commission") {
    return (
      <div className="flex flex-col gap-8">
        <dl className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr))]">
          <Stat label="Commission earned" value={formatInr(data.total)} />
          <Stat label="Traders" value={formatNumber(data.rows.length)} />
        </dl>
        <Card>
          <CardHeader>
            <CardTitle className="text-heading-md">Commission by trader</CardTitle>
            <CardDescription>Amount in ₹ thousands</CardDescription>
          </CardHeader>
          <div className="px-(--card-spacing)">
            <BarChart
              labels={data.rows.map((r) => r.party.name.split(" ")[0])}
              height={220}
              format={(n) => `${formatQty(n)}k`}
              summary={`Total commission ${formatInr(data.total)} from ${data.rows.length} traders.`}
              series={[{ name: "Commission (₹ thousand)", values: data.rows.map((r) => Math.round(r.commission / 10) / 100), className: "fill-primary" }]}
            />
          </div>
        </Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-[15px]">
            <caption className="sr-only">Commission by trader</caption>
            <thead>
              <tr className="h-10 border-b border-border text-left text-caption text-muted-foreground">
                <th scope="col" className="font-normal">Trader</th>
                <th scope="col" className="font-normal">Rate</th>
                <th scope="col" className="text-right font-normal">Sale value</th>
                <th scope="col" className="text-right font-normal">Commission</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.party.id} className="h-12 border-b border-border">
                  <th scope="row" className="text-left font-normal">{r.party.name}</th>
                  <td className="text-caption text-muted-foreground">{describeCommission(r.party.commission)}</td>
                  <td className="text-right tabular-nums">{formatInr(r.value)}</td>
                  <td className="text-right tabular-nums">{formatInr(r.commission)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="h-12">
                <th scope="row" colSpan={3} className="text-left font-normal">Total</th>
                <td className="text-right tabular-nums">{formatInr(data.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <BalanceTable title="Traders owe you" rows={data.traders} owedLabel="Unpaid sale value, less returns and payments" />
      <BalanceTable title="You owe sellers" rows={data.sellers} owedLabel="Goods sold, less commission and payments" />
    </div>
  );
}

function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div data-print-hide className="flex items-center justify-end gap-3">
      <Button variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
      <span className="text-sm tabular-nums text-muted-foreground">Page {page} of {pages}</span>
      <Button variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button>
    </div>
  );
}

export function AgentReportPage() {
  const { user } = useAuth();
  const now = useNow(60_000);
  const [tab, setTab] = useState<AgentReportKind>("sales");
  const [preset, setPreset] = useState<RangePreset>("7d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [partyId, setPartyId] = useState("");

  const key = `${preset}|${from}|${to}|${partyId}`;
  const query = useLiveQuery(`ar:${tab}:${key}`, (a) =>
    getAgentReport(tab, { range: resolveRange(preset, Date.now(), { from, to }), partyId: partyId || undefined }, { forceError: a === 0 && forcedErrors().has("report") })
  );

  const rangeText = describeRange(resolveRange(preset, now, { from, to }));
  const tabLabel = tabs.find((t) => t.id === tab)?.label ?? "";
  const empty =
    query.status === "ready" &&
    ((query.data.kind === "receipts" && query.data.rows.length === 0) ||
      (query.data.kind === "sales" && query.data.rows.length === 0) ||
      (query.data.kind === "commission" && query.data.rows.length === 0));

  return (
    <div className="flex flex-col gap-8 lg:gap-10">
      <div className="hidden print:block">
        <PrintBusiness />
        <h1 className="text-display-md">Commission agent report: {tabLabel}</h1>
        <p className="text-sm">{rangeText} · {activeGate()} · Generated by {user?.name}</p>
      </div>

      <div data-print-hide>
        <PageHeader
          title="Report"
          description="Receipts, sales, commission and balances."
          actions={
            <>
              <Button variant="outline" onClick={() => window.print()} disabled={query.status !== "ready"}>
                <PrinterIcon aria-hidden="true" />
                Print
              </Button>
              <Button
                onClick={() => query.status === "ready" && download(`agent-report-${tab}-${toDayInput(Date.now())}.csv`, csvFor(query.data))}
                disabled={query.status !== "ready" || !!empty}
              >
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
            id={`atab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls="agent-report-panel"
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            onKeyDown={(e) => {
              const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
              if (!dir) return;
              e.preventDefault();
              const next = tabs[(i + dir + tabs.length) % tabs.length];
              setTab(next.id);
              requestAnimationFrame(() => document.getElementById(`atab-${next.id}`)?.focus());
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
          <SelectField id="ar-range" label="Date range" icon={<CalendarIcon aria-hidden="true" />} value={preset} onChange={(v) => setPreset(v as RangePreset)} options={presetOptions} disabled={tab === "balances"} hint={tab === "balances" ? "Balances are as of now." : undefined} />
          <SelectField
            id="ar-party"
            label="Trader"
            value={partyId}
            onChange={setPartyId}
            options={[{ value: "", label: "All traders" }, ...listTraders().map((t) => ({ value: t.id, label: t.name }))]}
            disabled={tab === "receipts" || tab === "balances"}
          />
          {preset === "custom" && (
            <>
              <TextField id="ar-from" label="From" type="date" value={from || toDayInput(now - 6 * 86_400_000)} onChange={setFrom} />
              <TextField id="ar-to" label="To" type="date" value={to || toDayInput(now)} onChange={setTo} />
            </>
          )}
        </div>
      </Card>

      <section id="agent-report-panel" role="tabpanel" aria-labelledby={`atab-${tab}`} tabIndex={-1} className="outline-none">
        {query.status === "loading" && (
          <div className={BODY} role="status" aria-label="Loading report">
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr))]">
              {[0, 1, 2].map((i) => (
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
            <BlockEmpty icon={FileBarChartIcon} text="No records in this range." actionLabel="Show last 30 days" onAction={() => setPreset("30d")} className="h-full min-h-[480px]" />
          </Card>
        )}
        {query.status === "ready" && !empty && <Body key={`${tab}:${key}`} data={query.data} />}
      </section>
    </div>
  );
}
