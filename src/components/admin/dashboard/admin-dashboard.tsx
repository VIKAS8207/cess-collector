"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BanIcon,
  CalendarIcon,
  CircleCheckIcon,
  ClockIcon,
  TriangleAlertIcon,
  UserXIcon,
  KeyRoundIcon,
} from "lucide-react";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { SelectField } from "@/components/ui/select-field";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockEmpty, BlockError } from "@/components/dashboard/block-states";
import { CARD, GRID, KpiCard } from "@/components/dashboard/kpi-row";
import { BarChart, Legend } from "@/components/gate/bar-chart";
import { Dwell } from "@/components/gate/dwell";
import { PageHeader } from "@/components/gate/page-header";
import { useLiveQuery, type Query } from "@/hooks/use-live-query";
import { useNow } from "@/hooks/use-now";
import { useAuth } from "@/lib/auth-store";
import {
  getAdminAttention,
  getAdminKpis,
  getAdminRecent,
  getAdminSeries,
  getInsideNow,
  getOverdueBuyers,
  getPendingSettlements,
  type AdminAttention,
  type AdminKpis,
  type AdminSeries,
  type OverdueBuyer,
  type SettlementRow,
} from "@/lib/api/admin";
import { forcedErrors } from "@/lib/api/gate";
import { activeGate } from "@/lib/domain/settings";
import { rangePresets, resolveRange, type RangePreset } from "@/lib/domain/range";
import type { ActivityEvent } from "@/lib/domain/admin-types";
import type { Movement } from "@/lib/domain/types";
import { roleLabel } from "@/lib/roles";
import { formatCompactInr, formatDate, formatInr, formatNumber, formatStamp, formatTime } from "@/lib/format";
import { cn } from "cn";

const BODY = "h-[340px]";
const shiftOf = (now: number) => {
  const h = new Date(now).getHours();
  return h >= 6 && h < 14 ? "Morning" : h >= 14 && h < 22 ? "Evening" : "Night";
};
const greeting = (now: number) => {
  const h = new Date(now).getHours();
  return h >= 5 && h < 12 ? "Good morning" : h >= 12 && h < 17 ? "Good afternoon" : "Good evening";
};

function ListSkeleton({ label }: { label: string }) {
  return (
    <div className={BODY} role="status" aria-label={label}>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex h-14 items-center gap-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

function Kpis({ query, label }: { query: Query<AdminKpis>; label: string }) {
  if (query.status === "loading") {
    return (
      <div className={GRID} role="status" aria-label="Loading key figures">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Card key={i} className={CARD} aria-hidden="true">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-5 w-36" />
          </Card>
        ))}
      </div>
    );
  }
  if (query.status === "error") {
    return (
      <Card className="h-[132px] justify-center">
        <BlockError onRetry={query.retry} className="h-full" />
      </Card>
    );
  }
  const k = query.data;
  const m = k.money;
  const sub = label.toLowerCase();
  const behind = m.cessCollected < m.cessComputed - 0.005;
  return (
    <ul className={GRID} aria-label="Key figures">
      <li className="contents">
        <KpiCard label={`Vehicles in · out · ${sub}`} value={`${formatNumber(k.vehiclesIn)} in · ${formatNumber(k.vehiclesOut)} out`} delta={k.inDelta} />
      </li>
      <li className="contents">
        <KpiCard label={`Goods received · ${sub}`} value={formatInr(m.receivedValue)} delta={k.receivedDelta} />
      </li>
      <li className="contents">
        <KpiCard label={`Goods sold · ${sub}`} value={formatInr(m.soldValue)} delta={k.soldDelta} />
      </li>
      <li className="contents">
        <KpiCard label={`Commission earned · ${sub}`} value={formatInr(Math.round(m.commission))} delta={k.commissionDelta} />
      </li>
      <li className="contents">
        <Card className={cn(CARD, behind && "border-destructive/50")}>
          <p className="h-5 text-sm text-muted-foreground">CESS · {sub}</p>
          <dl className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-caption text-muted-foreground">Computed</dt>
              <dd className="text-[17px] tabular-nums text-foreground">{formatInr(m.cessComputed)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-caption text-muted-foreground">Collected</dt>
              <dd className="text-[17px] tabular-nums text-foreground">{formatInr(m.cessCollected)}</dd>
            </div>
          </dl>
          <p className={cn("h-4 text-caption", behind ? "text-destructive" : "text-muted-foreground")}>
            {behind ? `${formatInr(m.cessComputed - m.cessCollected)} not collected yet` : "Collected in full"}
          </p>
        </Card>
      </li>
      <li className="contents">
        <KpiCard attention={k.exceptions > 0} label="Open exceptions" value={formatNumber(k.exceptions)} note="Across all roles" />
      </li>
    </ul>
  );
}

function ChartCard({ query, mode, onMode, label }: { query: Query<AdminSeries>; mode: "gate" | "money"; onMode: (m: "gate" | "money") => void; label: string }) {
  const gate = mode === "gate";
  const every = query.status === "ready" ? (query.data.labels.length > 24 ? 5 : query.data.labels.length > 12 ? 3 : 1) : 1;
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const summary =
    query.status === "ready"
      ? gate
        ? `${sum(query.data.a)} entries and ${sum(query.data.b)} exits in this period.`
        : `Sold ${formatInr(sum(query.data.a))} and collected ${formatInr(sum(query.data.b))} of CESS in this period.`
      : "";
  const empty = query.status === "ready" && sum(query.data.a) === 0 && sum(query.data.b) === 0;
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-heading-md">{gate ? "Entries and exits" : "Sold value and CESS collected"}</CardTitle>
        <CardDescription>
          {label}
          {query.status === "ready" ? ` · ${query.data.period}` : ""}
        </CardDescription>
        <CardAction className="max-sm:hidden">
          <Legend items={gate ? [{ label: "Entries", className: "bg-primary" }, { label: "Exits", className: "bg-tag" }] : [{ label: "Sold value", className: "bg-primary" }, { label: "CESS collected", className: "bg-tag" }]} />
        </CardAction>
      </CardHeader>
      <div className="flex flex-col gap-4 px-(--card-spacing)">
        <Segmented label="Chart" value={mode} onChange={onMode} options={[{ value: "gate", label: "Gate" }, { value: "money", label: "Money" }]} className="self-start" />
        {query.status === "loading" && (
          <div role="status" aria-label="Loading chart" className="h-[280px]">
            <Skeleton className="h-full w-full" />
          </div>
        )}
        {query.status === "error" && <BlockError onRetry={query.retry} className="h-[280px]" />}
        {empty && <BlockEmpty icon={ClockIcon} text="No movements in this period." actionLabel="Switch chart" onAction={() => onMode(gate ? "money" : "gate")} className="h-[280px]" />}
        {query.status === "ready" && !empty && (
          <div className="h-[280px]">
            <BarChart
              labels={query.data.labels}
              height={250}
              axisWidth={gate ? 32 : 52}
              labelEvery={every}
              format={gate ? undefined : formatCompactInr}
              summary={summary}
              series={[
                { name: gate ? "Entries" : "Sold value", values: query.data.a, className: "fill-primary" },
                { name: gate ? "Exits" : "CESS collected", values: query.data.b, className: "fill-tag" },
              ]}
            />
            <p className="sr-only">{summary}</p>
          </div>
        )}
      </div>
    </Card>
  );
}

function InsideCard({ query }: { query: Query<Movement[]> }) {
  const now = useNow(30_000);
  const router = useRouter();
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-heading-md">Vehicles inside right now</CardTitle>
        <CardDescription>{query.status === "ready" ? `${query.data.length} at ${activeGate()}` : "Longest stay first"}</CardDescription>
      </CardHeader>
      <div className="px-(--card-spacing)">
        {query.status === "loading" && <ListSkeleton label="Loading vehicles inside" />}
        {query.status === "error" && <BlockError onRetry={query.retry} className={BODY} />}
        {query.status === "ready" && query.data.length === 0 && <BlockEmpty icon={CircleCheckIcon} text="No vehicles inside." actionLabel="Open All Activity" onAction={() => router.push("/activity")} className={BODY} />}
        {query.status === "ready" && query.data.length > 0 && (
          <div className={cn(BODY, "@container overflow-auto")}>
            <table className="w-full min-w-[260px]">
              <caption className="sr-only">Vehicles inside</caption>
              <thead>
                <tr className="h-10 border-b border-border text-left text-caption text-muted-foreground">
                  <th scope="col" className="font-normal">Vehicle</th>
                  <th scope="col" className="hidden font-normal @sm:table-cell">Entry</th>
                  <th scope="col" className="text-right font-normal">Dwell</th>
                </tr>
              </thead>
              <tbody>
                {[...query.data].sort((a, b) => a.entryAt! - b.entryAt!).map((m) => (
                  <tr key={m.id} className="h-14 border-b border-border last:border-b-0">
                    <th scope="row" className="py-1 text-left font-normal">
                      <span className="block text-[15px] text-foreground">{m.plate || m.fastag}</span>
                      <span className="block text-caption text-muted-foreground">{m.driverName}</span>
                    </th>
                    <td className="hidden text-caption tabular-nums text-muted-foreground @sm:table-cell">{formatTime(m.entryAt!)}</td>
                    <td className="text-right text-caption"><Dwell ms={now ? now - m.entryAt! : null} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}

function SettlementsCard({ query }: { query: Query<SettlementRow[]> }) {
  const router = useRouter();
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-heading-md">Pending settlements</CardTitle>
        <CardDescription>Sellers the agents still owe, oldest first</CardDescription>
      </CardHeader>
      <div className="px-(--card-spacing)">
        {query.status === "loading" && <ListSkeleton label="Loading pending settlements" />}
        {query.status === "error" && <BlockError onRetry={query.retry} className={BODY} />}
        {query.status === "ready" && query.data.length === 0 && <BlockEmpty icon={CircleCheckIcon} text="No settlements pending." actionLabel="Open Report" onAction={() => router.push("/report")} className={BODY} />}
        {query.status === "ready" && query.data.length > 0 && (
          <ul className={cn(BODY, "overflow-y-auto")}>
            {query.data.map((r) => (
              <li key={r.party.id} className="flex min-h-14 items-center justify-between gap-3 border-b border-border py-2 last:border-b-0">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[15px] text-foreground">{r.party.name}</span>
                  <span className="text-caption text-muted-foreground">{r.since ? `Oldest unpaid ${formatDate(r.since)}` : "Open balance"}</span>
                </span>
                <span className="shrink-0 tabular-nums text-foreground">{formatInr(r.balance)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function OverdueCard({ query }: { query: Query<OverdueBuyer[]> }) {
  const router = useRouter();
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-heading-md">Overdue buyers</CardTitle>
        <CardDescription>Past the overdue threshold, with the trader who owns them</CardDescription>
      </CardHeader>
      <div className="px-(--card-spacing)">
        {query.status === "loading" && <ListSkeleton label="Loading overdue buyers" />}
        {query.status === "error" && <BlockError onRetry={query.retry} className={BODY} />}
        {query.status === "ready" && query.data.length === 0 && <BlockEmpty icon={CircleCheckIcon} text="No overdue buyers." actionLabel="Open Report" onAction={() => router.push("/report")} className={BODY} />}
        {query.status === "ready" && query.data.length > 0 && (
          <ul className={cn(BODY, "overflow-y-auto")}>
            {query.data.map((b) => (
              <li key={b.id} className="flex min-h-14 items-center justify-between gap-3 border-b border-border py-2 last:border-b-0">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[15px] text-foreground">{b.name}</span>
                  <span className="text-caption text-muted-foreground">{b.owner} · {b.days} days</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="tabular-nums text-foreground">{formatInr(b.due)}</span>
                  <Pill tone="danger">Overdue</Pill>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

const attIcon = { mismatch: TriangleAlertIcon, overstay: ClockIcon, otp: KeyRoundIcon, "inactive-user": UserXIcon } as const;

function AttentionCard({ query }: { query: Query<AdminAttention[]> }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-heading-md">Needs attention</CardTitle>
        <CardDescription>Mismatches, over-stays, blocked OTPs, inactive users</CardDescription>
      </CardHeader>
      <div className="px-(--card-spacing)">
        {query.status === "loading" && <ListSkeleton label="Loading items that need attention" />}
        {query.status === "error" && <BlockError onRetry={query.retry} className={BODY} />}
        {query.status === "ready" && query.data.length === 0 && (
          <div className={cn(BODY, "flex flex-col items-center justify-center gap-3 text-center")}>
            <CircleCheckIcon aria-hidden="true" className="size-6 text-primary" />
            <p className="text-body-md text-muted-foreground">Nothing needs attention.</p>
            <Link href="/activity" className="text-sm text-primary hover:underline">Open All Activity</Link>
          </div>
        )}
        {query.status === "ready" && query.data.length > 0 && (
          <ul className={cn(BODY, "overflow-y-auto")}>
            {query.data.map((a) => {
              const Icon = attIcon[a.kind] ?? BanIcon;
              return (
                <li key={a.id} className="flex min-h-16 items-center gap-3 border-b border-border py-2 last:border-b-0">
                  <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                    <Icon className="size-4 text-destructive" />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[15px] text-foreground">{a.title}</span>
                    <span className="truncate text-caption text-muted-foreground">{a.detail} {formatStamp(a.at)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}

function RecentCard({ query }: { query: Query<ActivityEvent[]> }) {
  const router = useRouter();
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-heading-md">Recent activity</CardTitle>
        <CardDescription>Last 15 events across all roles</CardDescription>
        <CardAction>
          <Link href="/activity" className="text-sm text-primary hover:underline">View all</Link>
        </CardAction>
      </CardHeader>
      <div className="px-(--card-spacing)">
        {query.status === "loading" && <ListSkeleton label="Loading recent activity" />}
        {query.status === "error" && <BlockError onRetry={query.retry} className={BODY} />}
        {query.status === "ready" && query.data.length === 0 && <BlockEmpty icon={ClockIcon} text="No activity yet." actionLabel="Open All Activity" onAction={() => router.push("/activity")} className={BODY} />}
        {query.status === "ready" && query.data.length > 0 && (
          <ul className={cn(BODY, "overflow-y-auto")}>
            {query.data.map((e) => (
              <li key={e.id} className="flex min-h-14 flex-col justify-center gap-0.5 border-b border-border py-2 last:border-b-0">
                <span className="flex items-center gap-2">
                  <Pill tone="brand">{roleLabel(e.role)}</Pill>
                  <span className="truncate text-[15px] text-foreground">{e.summary}</span>
                </span>
                <span className="text-caption text-muted-foreground">{formatStamp(e.at)} · {e.user}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

export function AdminDashboard() {
  const { user } = useAuth();
  const now = useNow(60_000);
  const [preset, setPreset] = useState<RangePreset>("today");
  const [mode, setMode] = useState<"gate" | "money">("gate");
  const label = rangePresets.find((r) => r.id === preset)?.label ?? "";
  const opts = (name: string, attempt: number) => ({ forceError: attempt === 0 && forcedErrors().has(name) });

  const kpis = useLiveQuery(`ad-kpis:${preset}`, (a) => getAdminKpis(resolveRange(preset, Date.now()), opts("kpis", a)));
  const series = useLiveQuery(`ad-series:${preset}:${mode}`, (a) => getAdminSeries(resolveRange(preset, Date.now()), mode, opts("chart", a)));
  const inside = useLiveQuery("ad-inside", (a) => getInsideNow(opts("inside", a)));
  const settle = useLiveQuery("ad-settle", (a) => getPendingSettlements(opts("settlements", a)));
  const overdue = useLiveQuery("ad-overdue", (a) => getOverdueBuyers(opts("overdue", a)));
  const attention = useLiveQuery("ad-attention", (a) => getAdminAttention(opts("attention", a)));
  const recent = useLiveQuery("ad-recent", (a) => getAdminRecent(opts("recent", a)));

  return (
    <div className="flex flex-col gap-8 lg:gap-10">
      <PageHeader
        title={now ? `${greeting(now)}, ${user?.name.split(" ")[0] ?? ""}` : "Dashboard"}
        description={now ? `${formatDate(now)} · ${shiftOf(now)} shift · ${activeGate()} · ${user?.name}` : undefined}
        actions={
          <SelectField
            id="ad-range"
            label="Date range"
            hideLabel
            icon={<CalendarIcon aria-hidden="true" />}
            value={preset}
            onChange={(v) => setPreset(v as RangePreset)}
            options={rangePresets.map((r) => ({ value: r.id, label: r.label }))}
          />
        }
      />

      <Kpis query={kpis} label={label} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ChartCard query={series} mode={mode} onMode={setMode} label={label} />
        </div>
        <AttentionCard query={attention} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <InsideCard query={inside} />
        <SettlementsCard query={settle} />
        <OverdueCard query={overdue} />
      </div>

      <RecentCard query={recent} />
    </div>
  );
}
