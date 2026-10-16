"use client";

import { useState } from "react";
import { PrintBusiness } from "@/components/gate/print-business";
import { activeGate } from "@/lib/domain/settings";
import { CalendarIcon, DownloadIcon, FileBarChartIcon, PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SelectField } from "@/components/ui/select-field";
import { Skeleton } from "@/components/ui/skeleton";
import { TextField } from "@/components/auth/text-field";
import { BlockEmpty, BlockError } from "@/components/dashboard/block-states";
import { BarChart, Legend } from "@/components/gate/bar-chart";
import { Dwell } from "@/components/gate/dwell";
import { PageHeader } from "@/components/gate/page-header";
import { StatusPill } from "@/components/gate/status-pill";
import { useAuth } from "@/lib/auth-store";
import {
  forcedErrors,
  getReport,
  type Count,
  type Filters,
  type ReportData,
  type ReportKind,
} from "@/lib/api/gate";
import { describeRange, resolveRange, toDayInput, type RangePreset } from "@/lib/domain/range";
import {
  exceptionLabels,
  statuses,
  vehicleTypes,
  type Movement,
  type Status,
  type VehicleType,
} from "@/lib/domain/types";
import { formatDuration, formatNumber, formatStamp } from "@/lib/format";
import { useLiveQuery } from "@/hooks/use-live-query";
import { useHotkey } from "@/hooks/use-hotkey";
import { useNow } from "@/hooks/use-now";
import { cn } from "cn";

const tabs: { id: ReportKind; label: string }[] = [
  { id: "summary", label: "Daily summary" },
  { id: "log", label: "Movement log" },
  { id: "dwell", label: "Dwell / TAT" },
  { id: "exceptions", label: "Exceptions" },
];

const presetOptions = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "custom", label: "Custom range" },
];

const BODY = "min-h-[480px]";
const LOG_PAGE = 50;

function csvEscape(v: string | number) {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function download(name: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const dur = (m: Movement, now: number) =>
  m.entryAt ? Math.round(((m.exitAt ?? now) - m.entryAt) / 60_000) : "";

function movementRows(rows: Movement[], now: number): (string | number)[][] {
  return [
    ["Entry no", "Plate", "FASTag", "Driver", "Type", "Purpose", "Transporter", "Entry", "Exit", "Status", "Dwell (min)", "Operator", "Gate"],
    ...rows.map((m) => [
      m.entryNo, m.plate, m.fastag, m.driverName, m.vehicleType, m.purpose, m.transporter,
      m.entryAt ? formatStamp(m.entryAt) : "", m.exitAt ? formatStamp(m.exitAt) : "", m.status, dur(m, now), m.operator, m.gate,
    ]),
  ];
}

function csvFor(data: ReportData, now: number): (string | number)[][] {
  switch (data.kind) {
    case "summary": {
      const d = data.data;
      return [
        ["Metric", "Value"],
        ["Entries", d.entries],
        ["Exits", d.exits],
        ["Currently inside", d.netInside],
        ["Average dwell (min)", d.avgDwell ? Math.round(d.avgDwell / 60_000) : ""],
        ["Longest dwell (min)", d.longest ? Math.round(d.longest.ms / 60_000) : ""],
        ["Peak hour", d.peakHour ?? ""],
        [],
        ["Vehicle type", "Count"],
        ...d.byType.map((c) => [c.label, c.count]),
        [],
        ["Purpose", "Count"],
        ...d.byPurpose.map((c) => [c.label, c.count]),
      ];
    }
    case "log":
      return movementRows(data.rows, now);
    case "dwell":
      return movementRows(data.data.rows, now);
    case "exceptions":
      return [
        ["Time", "Plate", "FASTag", "Type", "Reason", "State"],
        ...data.rows.map((r) => [formatStamp(r.at), r.plate, r.fastag, exceptionLabels[r.kind], r.reason, r.resolved ? "Resolved" : "Open"]),
      ];
  }
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

function CountList({ title, items }: { title: string; items: Count[] }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  const total = items.reduce((a, b) => a + b.count, 0);
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-heading-md">{title}</CardTitle>
      </CardHeader>
      <ul className="flex flex-col gap-4 px-(--card-spacing)">
        {items.map((i) => (
          <li key={i.label} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-foreground">{i.label}</span>
              <span className="tabular-nums text-foreground">
                {formatNumber(i.count)}
                <span className="text-muted-foreground"> · {total ? Math.round((i.count / total) * 100) : 0}%</span>
              </span>
            </div>
            <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${(i.count / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div data-print-hide className="flex items-center justify-end gap-3 pt-4">
      <Button variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </Button>
      <span className="text-sm tabular-nums text-muted-foreground">
        Page {page} of {pages}
      </span>
      <Button variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next
      </Button>
    </div>
  );
}

function MovementTable({ rows, now, totals }: { rows: Movement[]; now: number; totals?: { count: number; avg: number | null } }) {
  return (
    <div className="@container overflow-x-auto">
      <table className="w-full min-w-[520px] text-[15px]">
        <caption className="sr-only">Vehicle movements</caption>
        <thead>
          <tr className="h-10 border-b border-border text-left text-caption text-muted-foreground">
            <th scope="col" className="font-normal">Plate</th>
            <th scope="col" className="hidden font-normal @md:table-cell">Driver</th>
            <th scope="col" className="hidden font-normal @2xl:table-cell">Type</th>
            <th scope="col" className="hidden font-normal @2xl:table-cell">Purpose</th>
            <th scope="col" className="font-normal">Entry</th>
            <th scope="col" className="hidden font-normal @xl:table-cell">Exit</th>
            <th scope="col" className="font-normal">Status</th>
            <th scope="col" className="text-right font-normal">Dwell</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id} className="h-12 border-b border-border">
              <th scope="row" className="pr-3 text-left font-normal">{m.plate || "No plate"}</th>
              <td className="hidden max-w-36 truncate pr-3 @md:table-cell">{m.driverName}</td>
              <td className="hidden pr-3 @2xl:table-cell">{m.vehicleType}</td>
              <td className="hidden pr-3 @2xl:table-cell">{m.purpose}</td>
              <td className="pr-3 text-caption tabular-nums text-muted-foreground">{m.entryAt ? formatStamp(m.entryAt) : "—"}</td>
              <td className="hidden pr-3 text-caption tabular-nums text-muted-foreground @xl:table-cell">{m.exitAt ? formatStamp(m.exitAt) : "—"}</td>
              <td className="pr-3"><StatusPill movement={m} /></td>
              <td className="text-right text-caption">
                {m.entryAt ? <Dwell ms={(m.exitAt ?? now) - m.entryAt} open={m.status === "Inside"} /> : "—"}
              </td>
            </tr>
          ))}
        </tbody>
        {totals && (
          <tfoot>
            <tr className="h-12 text-sm text-foreground">
              <th scope="row" colSpan={2} className="text-left font-normal">
                Total: <span className="tabular-nums">{formatNumber(totals.count)}</span> records
              </th>
              <td colSpan={6} className="text-right tabular-nums">
                Average dwell {totals.avg === null ? "—" : formatDuration(totals.avg)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function ReportBody({ data, now }: { data: ReportData; now: number }) {
  const [page, setPage] = useState(1);

  if (data.kind === "summary") {
    const d = data.data;
    const hasSeries = d.series.entries.some((v) => v > 0) || d.series.exits.some((v) => v > 0);
    const summary = `${d.entries} entries and ${d.exits} exits in this period.`;
    return (
      <div className="flex flex-col gap-8">
        <dl className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr))]">
          <Stat label="Entries" value={formatNumber(d.entries)} />
          <Stat label="Exits" value={formatNumber(d.exits)} />
          <Stat label="Net inside" value={formatNumber(d.netInside)} />
          <Stat label="Average dwell" value={d.avgDwell === null ? "—" : formatDuration(d.avgDwell)} />
          <Stat label="Longest dwell" value={d.longest ? formatDuration(d.longest.ms) : "—"} note={d.longest?.plate} />
          <Stat label="Peak hour" value={d.peakHour ? d.peakHour.split(" ")[0] : "—"} note={d.peakHour?.replace(/^\S+ /, "")} />
        </dl>
        <Card>
          <CardHeader>
            <CardTitle className="text-heading-md">Entries and exits</CardTitle>
            <CardDescription>{d.series.period}</CardDescription>
          </CardHeader>
          <div className="flex flex-col gap-4 px-(--card-spacing)">
            <Legend items={[{ label: "Entries", className: "bg-primary" }, { label: "Exits", className: "bg-tag" }]} />
            {hasSeries ? (
              <BarChart
                labels={d.series.labels}
                labelEvery={d.series.labels.length > 24 ? 5 : d.series.labels.length > 12 ? 3 : 1}
                summary={summary}
                series={[
                  { name: "Entries", values: d.series.entries, className: "fill-primary" },
                  { name: "Exits", values: d.series.exits, className: "fill-tag" },
                ]}
              />
            ) : (
              <p className="text-sm text-muted-foreground">No movements to chart.</p>
            )}
          </div>
        </Card>
        <div className="grid gap-4 md:grid-cols-2">
          <CountList title="By vehicle type" items={d.byType} />
          <CountList title="By purpose" items={d.byPurpose} />
        </div>
      </div>
    );
  }

  if (data.kind === "log") {
    const pages = Math.max(1, Math.ceil(data.rows.length / LOG_PAGE));
    const p = Math.min(page, pages);
    return (
      <div>
        <MovementTable
          rows={data.rows.slice((p - 1) * LOG_PAGE, p * LOG_PAGE)}
          now={now}
          totals={{ count: data.rows.length, avg: data.avgDwell }}
        />
        <Pager page={p} pages={pages} onPage={setPage} />
      </div>
    );
  }

  if (data.kind === "dwell") {
    const d = data.data;
    const pages = Math.max(1, Math.ceil(d.rows.length / 25));
    const p = Math.min(page, pages);
    return (
      <div className="flex flex-col gap-8">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-heading-md">Average dwell per day</CardTitle>
              <CardDescription>Hours, completed visits only</CardDescription>
            </CardHeader>
            <div className="px-(--card-spacing)">
              {d.daily.length > 0 ? (
                <BarChart
                  labels={d.daily.map((x) => x.label)}
                  height={200}
                  labelEvery={d.daily.length > 12 ? 5 : 1}
                  format={(n) => `${n}h`}
                  summary={`Average dwell is ${d.avg ? formatDuration(d.avg) : "not available"} across ${d.daily.length} days.`}
                  series={[{ name: "Average dwell (h)", values: d.daily.map((x) => Math.round(x.value * 10) / 10), className: "fill-primary" }]}
                />
              ) : (
                <p className="text-sm text-muted-foreground">No completed visits.</p>
              )}
            </div>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-heading-md">Dwell distribution</CardTitle>
              <CardDescription>Vehicles by time on site</CardDescription>
            </CardHeader>
            <div className="px-(--card-spacing)">
              <BarChart
                labels={d.buckets.map((b) => b.label)}
                height={200}
                summary={`Most vehicles stay ${d.buckets.reduce((a, b) => (b.count > a.count ? b : a)).label}.`}
                series={[{ name: "Vehicles", values: d.buckets.map((b) => b.count), className: "fill-primary" }]}
              />
            </div>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-heading-md">Over-stays</CardTitle>
            <CardDescription>Stayed longer than 8 h</CardDescription>
          </CardHeader>
          <div className="px-(--card-spacing)">
            {d.overstays.length === 0 ? (
              <p className="text-sm text-muted-foreground">No over-stays in this range.</p>
            ) : (
              <MovementTable rows={d.overstays.slice(0, 25)} now={now} />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-heading-md">Longest stays</CardTitle>
            <CardDescription>Top {d.rows.length} vehicles by dwell</CardDescription>
          </CardHeader>
          <div className="px-(--card-spacing)">
            <MovementTable rows={d.rows.slice((p - 1) * 25, p * 25)} now={now} />
            <Pager page={p} pages={pages} onPage={setPage} />
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="@container overflow-x-auto">
      <table className="w-full min-w-[520px] text-[15px]">
        <caption className="sr-only">Exceptions</caption>
        <thead>
          <tr className="h-10 border-b border-border text-left text-caption text-muted-foreground">
            <th scope="col" className="font-normal">Time</th>
            <th scope="col" className="font-normal">Plate</th>
            <th scope="col" className="font-normal">Type</th>
            <th scope="col" className="hidden font-normal @xl:table-cell">Reason</th>
            <th scope="col" className="font-normal">State</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.id} className="h-12 border-b border-border">
              <td className="pr-3 text-caption tabular-nums text-muted-foreground">{formatStamp(r.at)}</td>
              <th scope="row" className="pr-3 text-left font-normal">{r.plate || r.fastag || "Unknown"}</th>
              <td className="pr-3">{exceptionLabels[r.kind]}</td>
              <td className="hidden pr-3 text-muted-foreground @xl:table-cell">{r.reason}</td>
              <td className="text-caption">{r.resolved ? "Resolved" : "Open"}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="h-12 text-sm">
            <td colSpan={5} className="tabular-nums">Total: {data.rows.length} exceptions</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function ReportPage() {
  const { user } = useAuth();
  const now = useNow(60_000);
  const [tab, setTab] = useState<ReportKind>("summary");
  const [preset, setPreset] = useState<RangePreset>("7d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [type, setType] = useState<VehicleType | "">("");
  const [status, setStatus] = useState<Status | "">("");

  const filtersKey = `${preset}|${from}|${to}|${type}|${status}`;
  const buildFilters = (): Filters => ({
    range: resolveRange(preset, Date.now(), { from, to }),
    type: type || undefined,
    status: status || undefined,
  });

  const query = useLiveQuery(`report:${tab}:${filtersKey}`, (attempt) =>
    getReport(tab, buildFilters(), { forceError: attempt === 0 && forcedErrors().has("report") })
  );

  useHotkey("/", () => document.getElementById("r-type")?.focus());

  const rangeText = describeRange(resolveRange(preset, now, { from, to }));
  const tabLabel = tabs.find((t) => t.id === tab)?.label ?? "";
  const empty =
    query.status === "ready" &&
    ((query.data.kind === "log" && query.data.rows.length === 0) ||
      (query.data.kind === "exceptions" && query.data.rows.length === 0) ||
      (query.data.kind === "summary" && query.data.data.entries === 0 && query.data.data.exits === 0) ||
      (query.data.kind === "dwell" && query.data.data.rows.length === 0));

  const exportCsv = () => {
    if (query.status !== "ready") return;
    download(
      `gate-report-${tab}-${toDayInput(Date.now())}.csv`,
      csvFor(query.data, Date.now())
    );
  };

  return (
    <div className="flex flex-col gap-8 lg:gap-10">
      <div className="hidden print:block">
        <PrintBusiness />
        <h1 className="text-display-md">Gate movement report: {tabLabel}</h1>
        <p className="text-sm">
          {rangeText} · {activeGate()} · Generated by {user?.name} on {formatStamp(now)}
        </p>
      </div>

      <div data-print-hide>
        <PageHeader
          title="Report"
          description="Review gate movements, dwell time and exceptions."
          actions={
            <>
              <Button variant="outline" onClick={() => window.print()} disabled={query.status !== "ready"}>
                <PrinterIcon aria-hidden="true" />
                Print
              </Button>
              <Button onClick={exportCsv} disabled={query.status !== "ready" || !!empty}>
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
            id={`tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls="report-panel"
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            onKeyDown={(e) => {
              const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
              if (!dir) return;
              e.preventDefault();
              const next = tabs[(i + dir + tabs.length) % tabs.length];
              setTab(next.id);
              requestAnimationFrame(() => document.getElementById(`tab-${next.id}`)?.focus());
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
          <SelectField
            id="r-range"
            label="Date range"
            icon={<CalendarIcon aria-hidden="true" />}
            value={preset}
            onChange={(v) => setPreset(v as RangePreset)}
            options={presetOptions}
          />
          <SelectField
            id="r-type"
            label="Vehicle type"
            value={type}
            onChange={(v) => setType(v as VehicleType | "")}
            options={[{ value: "", label: "All" }, ...vehicleTypes.map((v) => ({ value: v, label: v }))]}
          />
          <SelectField
            id="r-status"
            label="Status"
            value={status}
            onChange={(v) => setStatus(v as Status | "")}
            options={[{ value: "", label: "All" }, ...statuses.map((v) => ({ value: v, label: v }))]}
          />
          <SelectField id="r-gate" label="Gate" value={activeGate()} onChange={() => {}} options={[{ value: activeGate(), label: activeGate() }]} />
          {preset === "custom" && (
            <>
              <TextField
                id="r-from"
                label="From"
                type="date"
                value={from || toDayInput(now - 6 * 86_400_000)}
                onChange={setFrom}
              />
              <TextField id="r-to" label="To" type="date" value={to || toDayInput(now)} onChange={setTo} />
            </>
          )}
        </div>
      </Card>

      <section id="report-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={-1} className="outline-none">
        <p className="mb-4 hidden text-sm text-muted-foreground sm:block" data-print-hide>
          {tabLabel} · {rangeText} · {activeGate()}
        </p>
        {query.status === "loading" && (
          <div className={BODY} role="status" aria-label="Loading report">
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr))]">
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
            <BlockEmpty
              icon={FileBarChartIcon}
              text="No records in this range."
              actionLabel="Show last 30 days"
              onAction={() => setPreset("30d")}
              className="h-full min-h-[480px]"
            />
          </Card>
        )}
        {query.status === "ready" && !empty && (
          <ReportBody key={`${tab}:${filtersKey}`} data={query.data} now={now} />
        )}
      </section>
    </div>
  );
}
