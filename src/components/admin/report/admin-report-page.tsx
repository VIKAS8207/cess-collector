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
import { BarChart, Legend } from "@/components/gate/bar-chart";
import { PageHeader } from "@/components/gate/page-header";
import { downloadCsv } from "@/components/trader/collections/buyer-drawer";
import { useAuth } from "@/lib/auth-store";
import { activityUsers, getAdminReport, type AdminReportData, type AdminReportKind } from "@/lib/api/admin";
import { forcedErrors } from "@/lib/api/gate";
import { describeRange, resolveRange, toDayInput, type RangePreset } from "@/lib/domain/range";
import { businessInfo } from "@/lib/domain/settings";
import { exceptionLabels } from "@/lib/domain/types";
import { roleLabel, roles, type RoleId } from "@/lib/roles";
import { formatCompactInr, formatDate, formatDuration, formatInr, formatNumber, formatStamp } from "@/lib/format";
import { useLiveQuery } from "@/hooks/use-live-query";
import { useHotkey } from "@/hooks/use-hotkey";
import { useNow } from "@/hooks/use-now";
import { cn } from "cn";

const tabs: { id: AdminReportKind; label: string }[] = [
  { id: "operations", label: "Operations" },
  { id: "money", label: "Money" },
  { id: "balances", label: "Party balances" },
  { id: "users", label: "Users activity" },
];

const presetOptions = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "custom", label: "Custom range" },
];

const BODY = "min-h-[480px]";

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

function csvFor(d: AdminReportData): (string | number)[][] {
  if (d.kind === "operations")
    return [["Day", "In", "Out", "Inside at end of day"], ...d.days.map((x) => [x.label, x.in, x.out, x.inside])];
  if (d.kind === "money")
    return [
      ["Metric", "Value"],
      ["Goods received (estimated)", d.totals.receivedValue],
      ["Goods sold", d.totals.soldValue],
      ["Commission earned", d.totals.commission],
      ["CESS computed", d.totals.cessComputed],
      ["CESS collected", d.totals.cessCollected],
      [],
      ["Agent", "Earned", "Collected", "Pending"],
      ...d.agents.map((a) => [a.name, a.earned, a.collected, a.pending]),
      [],
      ["Trader", "CESS computed", "CESS collected", "CESS pending"],
      ...d.traders.map((t) => [t.name, t.computed, t.collected, t.pending]),
    ];
  if (d.kind === "balances")
    return [
      ["Party", "Kind", "Owner", "Balance", "Overdue"],
      ...d.parties.map((p) => [p.name, p.kind, p.owner, p.balance, p.overdue ? "Yes" : "No"]),
      ...d.buyers.map((b) => [b.name, "Buyer", b.owner, b.balance, b.overdue ? "Yes" : "No"]),
    ];
  return [
    ["User", "Role", "Status", "Gate records", "Receipts", "Sales and returns", "Payments", "Last active"],
    ...d.rows.map((r) => [r.user.name, roleLabel(r.user.role), r.user.status, r.entries, r.receipts, r.sales, r.payments, r.lastActive ? formatStamp(r.lastActive) : "Never"]),
  ];
}

function Body({ data }: { data: AdminReportData }) {
  if (data.kind === "operations") {
    const tin = data.days.reduce((a, d) => a + d.in, 0);
    const tout = data.days.reduce((a, d) => a + d.out, 0);
    return (
      <div className="flex flex-col gap-8">
        <dl className={statGrid}>
          <Stat label="Vehicles in" value={formatNumber(tin)} />
          <Stat label="Vehicles out" value={formatNumber(tout)} />
          <Stat label="Average dwell" value={data.avgDwell === null ? "—" : formatDuration(data.avgDwell)} />
          <Stat label="Receipts" value={formatNumber(data.receipts)} />
        </dl>
        <Card>
          <CardHeader>
            <CardTitle className="text-heading-md">Entries and exits per day</CardTitle>
          </CardHeader>
          <div className="flex flex-col gap-3 px-(--card-spacing)">
            <Legend items={[{ label: "Entries", className: "bg-primary" }, { label: "Exits", className: "bg-tag" }]} />
            <BarChart
              labels={data.days.map((d) => d.label)}
              height={220}
              labelEvery={data.days.length > 12 ? 5 : 1}
              summary={`${tin} entries and ${tout} exits over ${data.days.length} days.`}
              series={[
                { name: "Entries", values: data.days.map((d) => d.in), className: "fill-primary" },
                { name: "Exits", values: data.days.map((d) => d.out), className: "fill-tag" },
              ]}
            />
          </div>
        </Card>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-heading-md">Exceptions by type</CardTitle></CardHeader>
            <ul className="flex flex-col px-(--card-spacing)">
              {data.exceptions.length === 0 && <li className="py-3 text-sm text-muted-foreground">No exceptions in this range.</li>}
              {data.exceptions.map((e) => (
                <li key={e.label} className="flex justify-between border-b border-border py-3 text-[15px] last:border-b-0">
                  <span>{exceptionLabels[e.label as keyof typeof exceptionLabels] ?? e.label}</span>
                  <span className="tabular-nums">{e.count}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-heading-md">Lots by status</CardTitle></CardHeader>
            <ul className="flex flex-col px-(--card-spacing)">
              {data.lots.length === 0 && <li className="py-3 text-sm text-muted-foreground">No receipts in this range.</li>}
              {data.lots.map((e) => (
                <li key={e.label} className="flex justify-between border-b border-border py-3 text-[15px] last:border-b-0">
                  <span>{e.label}</span>
                  <span className="tabular-nums">{e.count}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-[15px]">
            <caption className="sr-only">Vehicles per day</caption>
            <thead>
              <tr className="h-10 border-b border-border text-left text-caption text-muted-foreground">
                <th scope="col" className="font-normal">Day</th>
                <th scope="col" className="text-right font-normal">In</th>
                <th scope="col" className="text-right font-normal">Out</th>
                <th scope="col" className="text-right font-normal">Inside at end of day</th>
              </tr>
            </thead>
            <tbody>
              {data.days.map((d) => (
                <tr key={d.label} className="h-12 border-b border-border">
                  <th scope="row" className="text-left font-normal">{d.label}</th>
                  <td className="text-right tabular-nums">{d.in}</td>
                  <td className="text-right tabular-nums">{d.out}</td>
                  <td className="text-right tabular-nums">{d.inside}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (data.kind === "money") {
    const t = data.totals;
    return (
      <div className="flex flex-col gap-8">
        <dl className={statGrid}>
          <Stat label="Goods received (estimated)" value={formatInr(t.receivedValue)} note="At each item's average sale rate" />
          <Stat label="Goods sold" value={formatInr(t.soldValue)} note={`Agents ${formatInr(t.agentSold)} + traders ${formatInr(t.traderSold)}`} />
          <Stat label="Commission earned" value={formatInr(Math.round(t.commission))} />
          <Stat label="CESS computed" value={formatInr(t.cessComputed)} />
          <Stat label="CESS collected" value={formatInr(t.cessCollected)} />
        </dl>
        {data.days.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-heading-md">Commission and CESS collected per day</CardTitle>
              <CardDescription>Value in ₹</CardDescription>
            </CardHeader>
            <div className="flex flex-col gap-3 px-(--card-spacing)">
              <Legend items={[{ label: "Commission", className: "bg-primary" }, { label: "CESS collected", className: "bg-tag" }]} />
              <BarChart
                labels={data.days.map((d) => d.label)}
                height={220}
                axisWidth={52}
                labelEvery={data.days.length > 12 ? 5 : 1}
                format={formatCompactInr}
                summary={`Commission ${formatInr(Math.round(t.commission))} and CESS collected ${formatInr(t.cessCollected)}.`}
                series={[
                  { name: "Commission", values: data.days.map((d) => Math.round(d.commission)), className: "fill-primary" },
                  { name: "CESS collected", values: data.days.map((d) => Math.round(d.cess)), className: "fill-tag" },
                ]}
              />
            </div>
          </Card>
        )}
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[360px] text-[15px]">
              <caption className="mb-2 text-left text-heading-md text-foreground">Commission by agent</caption>
              <thead>
                <tr className="h-10 border-b border-border text-left text-caption text-muted-foreground">
                  <th scope="col" className="font-normal">Agent</th>
                  <th scope="col" className="text-right font-normal">Earned</th>
                  <th scope="col" className="text-right font-normal">Collected</th>
                  <th scope="col" className="text-right font-normal">Pending</th>
                </tr>
              </thead>
              <tbody>
                {data.agents.map((a) => (
                  <tr key={a.name} className="h-12 border-b border-border">
                    <th scope="row" className="text-left font-normal">{a.name}</th>
                    <td className="text-right tabular-nums">{formatInr(Math.round(a.earned))}</td>
                    <td className="text-right tabular-nums">{formatInr(Math.round(a.collected))}</td>
                    <td className="text-right tabular-nums">{formatInr(Math.round(a.pending))}</td>
                  </tr>
                ))}
                {data.agents.length === 0 && <tr><td colSpan={4} className="py-3 text-sm text-muted-foreground">No agent sales in this range.</td></tr>}
              </tbody>
              <tfoot>
                <tr className="h-12">
                  <th scope="row" className="text-left font-normal">Total</th>
                  <td className="text-right tabular-nums">{formatInr(Math.round(data.agents.reduce((a, x) => a + x.earned, 0)))}</td>
                  <td className="text-right tabular-nums">{formatInr(Math.round(data.agents.reduce((a, x) => a + x.collected, 0)))}</td>
                  <td className="text-right tabular-nums">{formatInr(Math.round(data.agents.reduce((a, x) => a + x.pending, 0)))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[360px] text-[15px]">
              <caption className="mb-2 text-left text-heading-md text-foreground">CESS by trader</caption>
              <thead>
                <tr className="h-10 border-b border-border text-left text-caption text-muted-foreground">
                  <th scope="col" className="font-normal">Trader</th>
                  <th scope="col" className="text-right font-normal">Computed</th>
                  <th scope="col" className="text-right font-normal">Collected</th>
                  <th scope="col" className="text-right font-normal">Pending</th>
                </tr>
              </thead>
              <tbody>
                {data.traders.map((a) => (
                  <tr key={a.name} className="h-12 border-b border-border">
                    <th scope="row" className="text-left font-normal">{a.name}</th>
                    <td className="text-right tabular-nums">{formatInr(a.computed)}</td>
                    <td className="text-right tabular-nums">{formatInr(a.collected)}</td>
                    <td className="text-right tabular-nums">{formatInr(a.pending)}</td>
                  </tr>
                ))}
                {data.traders.length === 0 && <tr><td colSpan={4} className="py-3 text-sm text-muted-foreground">No trader bills in this range.</td></tr>}
              </tbody>
              <tfoot>
                <tr className="h-12">
                  <th scope="row" className="text-left font-normal">Total</th>
                  <td className="text-right tabular-nums">{formatInr(data.traders.reduce((a, x) => a + x.computed, 0))}</td>
                  <td className="text-right tabular-nums">{formatInr(data.traders.reduce((a, x) => a + x.collected, 0))}</td>
                  <td className="text-right tabular-nums">{formatInr(data.traders.reduce((a, x) => a + x.pending, 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.byRole.map((r) => (
            <li key={r.label} className="flex justify-between rounded-card border border-border p-4 text-[15px]">
              <span>{r.label}</span>
              <span className="tabular-nums">{formatInr(r.value)}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (data.kind === "balances") {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[360px] text-[15px]">
            <caption className="mb-2 text-left text-heading-md text-foreground">Agent side: parties with dues</caption>
            <thead>
              <tr className="h-10 border-b border-border text-left text-caption text-muted-foreground">
                <th scope="col" className="font-normal">Party</th>
                <th scope="col" className="font-normal">Kind</th>
                <th scope="col" className="text-right font-normal">Balance</th>
              </tr>
            </thead>
            <tbody>
              {data.parties.map((p) => (
                <tr key={p.id} className="h-12 border-b border-border">
                  <th scope="row" className="text-left font-normal">{p.name} {p.overdue && <Pill tone="danger" className="ml-2">Overdue</Pill>}</th>
                  <td className="text-caption text-muted-foreground">{p.kind}</td>
                  <td className="text-right tabular-nums">{formatInr(p.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[360px] text-[15px]">
            <caption className="mb-2 text-left text-heading-md text-foreground">Trader side: buyers with dues</caption>
            <thead>
              <tr className="h-10 border-b border-border text-left text-caption text-muted-foreground">
                <th scope="col" className="font-normal">Buyer</th>
                <th scope="col" className="font-normal">Trader</th>
                <th scope="col" className="text-right font-normal">Balance</th>
              </tr>
            </thead>
            <tbody>
              {data.buyers.map((b) => (
                <tr key={b.id} className="h-12 border-b border-border">
                  <th scope="row" className="text-left font-normal">{b.name} {b.overdue && <Pill tone="danger" className="ml-2">Overdue</Pill>}</th>
                  <td className="text-caption text-muted-foreground">{b.owner}</td>
                  <td className="text-right tabular-nums">{formatInr(b.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="@container overflow-x-auto">
      <table className="w-full min-w-[480px] text-[15px]">
        <caption className="sr-only">Users activity</caption>
        <thead>
          <tr className="h-10 border-b border-border text-left text-caption text-muted-foreground">
            <th scope="col" className="font-normal">User</th>
            <th scope="col" className="font-normal">Status</th>
            <th scope="col" className="hidden text-right font-normal @lg:table-cell">Gate</th>
            <th scope="col" className="hidden text-right font-normal @lg:table-cell">Receipts</th>
            <th scope="col" className="text-right font-normal">Sales</th>
            <th scope="col" className="text-right font-normal">Payments</th>
            <th scope="col" className="hidden pl-4 font-normal @xl:table-cell">Last active</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.user.id} className="h-14 border-b border-border">
              <th scope="row" className="py-1 text-left font-normal">
                {r.user.name}
                <span className="block text-caption text-muted-foreground">{roleLabel(r.user.role)}</span>
              </th>
              <td><Pill tone={r.user.status === "active" ? "neutral" : "danger"}>{r.user.status === "active" ? "Active" : "Inactive"}</Pill></td>
              <td className="hidden text-right tabular-nums @lg:table-cell">{r.entries}</td>
              <td className="hidden text-right tabular-nums @lg:table-cell">{r.receipts}</td>
              <td className="text-right tabular-nums">{r.sales}</td>
              <td className="text-right tabular-nums">{r.payments}</td>
              <td className="hidden pl-4 text-caption tabular-nums text-muted-foreground @xl:table-cell">{r.lastActive ? formatDate(r.lastActive) : "Never"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminReportPage() {
  const { user } = useAuth();
  const now = useNow(60_000);
  const [tab, setTab] = useState<AdminReportKind>("operations");
  const [preset, setPreset] = useState<RangePreset>("7d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [role, setRole] = useState<RoleId | "">("");
  const [who, setWho] = useState("");

  const key = `${preset}|${from}|${to}|${role}|${who}`;
  const query = useLiveQuery(`adr:${tab}:${key}`, (a) =>
    getAdminReport(tab, { range: resolveRange(preset, Date.now(), { from, to }), role: role || undefined, user: who || undefined }, { forceError: a === 0 && forcedErrors().has("report") })
  );
  useHotkey("/", () => document.getElementById("ar-user")?.focus());

  const rangeText = describeRange(resolveRange(preset, now, { from, to }));
  const tabLabel = tabs.find((t) => t.id === tab)?.label ?? "";
  const empty =
    query.status === "ready" &&
    ((query.data.kind === "balances" && query.data.parties.length + query.data.buyers.length === 0) ||
      (query.data.kind === "users" && query.data.rows.length === 0));
  const biz = businessInfo();

  return (
    <div className="flex flex-col gap-8 lg:gap-10">
      <div className="hidden print:block">
        <p className="text-sm">{biz.name} · {biz.address}, {biz.city} · {biz.phone}</p>
        <h1 className="text-display-md">Admin report: {tabLabel}</h1>
        <p className="text-sm">{rangeText} · Generated by {user?.name} on {formatStamp(now)}</p>
      </div>

      <div data-print-hide>
        <PageHeader
          title="Report"
          description="Operations, money, balances and user activity across all roles."
          actions={
            <>
              <Button variant="outline" onClick={() => window.print()} disabled={query.status !== "ready"}>
                <PrinterIcon aria-hidden="true" />
                Print
              </Button>
              <Button onClick={() => query.status === "ready" && downloadCsv(`admin-report-${tab}-${toDayInput(Date.now())}.csv`, csvFor(query.data))} disabled={query.status !== "ready" || !!empty}>
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
            id={`adtab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls="admin-report-panel"
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            onKeyDown={(e) => {
              const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
              if (!dir) return;
              e.preventDefault();
              const next = tabs[(i + dir + tabs.length) % tabs.length];
              setTab(next.id);
              requestAnimationFrame(() => document.getElementById(`adtab-${next.id}`)?.focus());
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
          <SelectField id="ar-role" label="Role" value={role} onChange={(v) => setRole(v as RoleId | "")} options={[{ value: "", label: "All roles" }, ...roles.map((r) => ({ value: r.id, label: r.label }))]} disabled={tab !== "users"} />
          <SelectField id="ar-user" label="User" value={who} onChange={setWho} options={[{ value: "", label: "All users" }, ...activityUsers().map((u) => ({ value: u, label: u }))]} disabled={tab === "balances" || tab === "operations"} />
          {preset === "custom" && (
            <>
              <TextField id="ar-from" label="From" type="date" value={from || toDayInput(now - 6 * 86_400_000)} onChange={setFrom} />
              <TextField id="ar-to" label="To" type="date" value={to || toDayInput(now)} onChange={setTo} />
            </>
          )}
        </div>
      </Card>

      <section id="admin-report-panel" role="tabpanel" aria-labelledby={`adtab-${tab}`} tabIndex={-1} className="outline-none">
        {query.status === "loading" && (
          <div className={BODY} role="status" aria-label="Loading report">
            <div className={statGrid}>
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
