"use client";

import { DataTable, TablePager, type Column } from "@/components/ui/data-table";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarIcon, DownloadIcon, EyeIcon, HistoryIcon, PrinterIcon, SearchIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/ui/pill";
import { SelectField } from "@/components/ui/select-field";
import { Skeleton } from "@/components/ui/skeleton";
import { TextField } from "@/components/auth/text-field";
import { BlockEmpty, BlockError } from "@/components/dashboard/block-states";
import { PageHeader } from "@/components/gate/page-header";
import { SideDrawer } from "@/components/gate/side-drawer";
import { downloadCsv } from "@/components/trader/collections/buyer-drawer";
import { useAuth } from "@/lib/auth-store";
import { activityUsers, filterActivity, getActivity } from "@/lib/api/admin";
import { forcedErrors } from "@/lib/api/gate";
import { activityTypes, type ActivityEvent, type ActivityType } from "@/lib/domain/admin-types";
import { describeRange, resolveRange, toDayInput } from "@/lib/domain/range";
import { businessInfo, config } from "@/lib/domain/settings";
import { DAY } from "@/lib/domain/types";
import { roleLabel, roles, type RoleId } from "@/lib/roles";
import { formatStamp } from "@/lib/format";
import { useLiveQuery } from "@/hooks/use-live-query";
import { useHotkey } from "@/hooks/use-hotkey";
import { useNow } from "@/hooks/use-now";

const BODY = "min-h-[560px]";
const DEFAULT_RANGE = "7d";
const SIZES = [25, 50, 100];
const rangeOptions = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "custom", label: "Custom range" },
];

function rangeFor(id: string, now: number, from: string, to: string) {
  if (id === "90d") {
    const r = resolveRange("today", now);
    return { from: r.from - 89 * DAY, to: r.to };
  }
  const r = resolveRange(id as "today" | "7d" | "30d" | "custom", now, { from, to });
  const floor = resolveRange("today", now).to - config.retentionDays * DAY;
  return { from: Math.max(r.from, floor), to: r.to };
}

const typeLabel = (t: ActivityType) => activityTypes.find((x) => x.value === t)?.label ?? t;

const activityColumns: Column<ActivityEvent>[] = [
  { key: "time", header: "Time", primary: true, cell: (e) => <span className="text-caption tabular-nums">{formatStamp(e.at)}</span> },
  { key: "role", header: "Role", cell: (e) => <Pill tone={e.role === "admin" ? "danger" : "brand"}>{roleLabel(e.role)}</Pill> },
  { key: "user", header: "User", hideBelow: "lg", cell: (e) => e.user },
  { key: "type", header: "Type", hideBelow: "xl", cell: (e) => <Pill tone="neutral">{typeLabel(e.type)}</Pill> },
  {
    key: "summary",
    header: "Summary",
    className: "max-w-md whitespace-normal py-2 text-foreground",
    cell: (e) => (
      <>
        {e.summary}
        {e.oldValue || e.newValue ? (
          <span className="block text-caption text-muted-foreground">
            {e.oldValue ?? "—"} → {e.newValue ?? "—"}
          </span>
        ) : null}
      </>
    ),
  },
  { key: "ref", header: "Ref", hideBelow: "2xl", cell: (e) => <span className="block max-w-32 truncate text-caption text-muted-foreground">{e.ref}</span> },
];

export function ActivityPage() {
  const { user } = useAuth();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const now = useNow(60_000);
  const searchRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef(params.toString());
  useEffect(() => {
    latest.current = params.toString();
  }, [params]);

  const rangeId = params.get("range") ?? DEFAULT_RANGE;
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const role = roles.find((r) => r.id === params.get("role"))?.id as RoleId | undefined;
  const who = params.get("user") ?? "";
  const type = activityTypes.find((t) => t.value === params.get("type"))?.value;
  const q = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const size = SIZES.includes(Number(params.get("size"))) ? Number(params.get("size")) : 25;
  const [qInput, setQInput] = useState(q);
  const [openEvent, setOpenEvent] = useState<ActivityEvent | null>(null);

  const update = (patch: Record<string, string | null>) => {
    const sp = new URLSearchParams(latest.current);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") sp.delete(k);
      else sp.set(k, v);
    }
    if (!("page" in patch)) sp.delete("page");
    const qs = sp.toString();
    latest.current = qs;
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const onSearch = (v: string) => {
    setQInput(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => update({ q: v.trim() }), 250);
  };

  const key = params.toString();
  const result = useLiveQuery(`act:${key}`, (a) =>
    getActivity({ range: rangeFor(rangeId, Date.now(), from, to), role, user: who || undefined, type, q }, page, size, { forceError: a === 0 && forcedErrors().has("activity") })
  );
  useHotkey("/", () => searchRef.current?.focus());

  const chips: { id: string; label: string; patch: Record<string, string | null> }[] = [];
  if (role) chips.push({ id: "role", label: `Role: ${roleLabel(role)}`, patch: { role: null } });
  if (who) chips.push({ id: "user", label: `User: ${who}`, patch: { user: null } });
  if (type) chips.push({ id: "type", label: `Type: ${typeLabel(type)}`, patch: { type: null } });
  if (q) chips.push({ id: "q", label: `Search: ${q}`, patch: { q: null } });
  if (rangeId !== DEFAULT_RANGE) chips.push({ id: "range", label: `Range: ${rangeOptions.find((r) => r.value === rangeId)?.label ?? rangeId}`, patch: { range: null, from: null, to: null } });

  const exportCsv = () => {
    const rows = filterActivity({ range: rangeFor(rangeId, Date.now(), from, to), role, user: who || undefined, type, q }, Date.now());
    downloadCsv(`activity-${toDayInput(Date.now())}.csv`, [
      ["Time", "Role", "User", "Type", "Summary", "Reference", "Old value", "New value"],
      ...rows.map((e) => [formatStamp(e.at), roleLabel(e.role), e.user, typeLabel(e.type), e.summary, e.ref, e.oldValue ?? "", e.newValue ?? ""]),
    ]);
  };

  const printRange = describeRange(rangeFor(rangeId, now, from, to));
  const biz = businessInfo();

  return (
    <div className="flex flex-col gap-8 lg:gap-10">
      <div className="hidden print:block">
        <p className="text-sm">{biz.name} · {biz.address}, {biz.city} · {biz.phone}</p>
        <h1 className="text-display-md">All activity</h1>
        <p className="text-sm">{printRange} · Generated by {user?.name} on {formatStamp(now)}</p>
      </div>

      <div data-print-hide>
        <PageHeader
          title="All Activity"
          description="Every change and every record, from every role. Read only."
          actions={
            <>
              <Button variant="outline" onClick={() => window.print()} disabled={result.status !== "ready"}>
                <PrinterIcon aria-hidden="true" />
                Print
              </Button>
              <Button variant="outline" onClick={exportCsv} disabled={result.status !== "ready" || result.data.total === 0}>
                <DownloadIcon aria-hidden="true" />
                Export CSV
              </Button>
            </>
          }
        />
      </div>

      <Card className="gap-4">
        <div data-print-hide className="grid gap-4 px-(--card-spacing) sm:grid-cols-2 xl:grid-cols-5">
          <SelectField id="ac-range" label="Date range" icon={<CalendarIcon aria-hidden="true" />} value={rangeId} onChange={(v) => update({ range: v === DEFAULT_RANGE ? null : v, from: null, to: null })} options={rangeOptions} />
          <SelectField id="ac-role" label="Role" value={role ?? ""} onChange={(v) => update({ role: v })} options={[{ value: "", label: "All roles" }, ...roles.map((r) => ({ value: r.id, label: r.label }))]} />
          <SelectField id="ac-user" label="User" value={who} onChange={(v) => update({ user: v })} options={[{ value: "", label: "All users" }, ...activityUsers().map((u) => ({ value: u, label: u }))]} />
          <SelectField id="ac-type" label="Event type" value={type ?? ""} onChange={(v) => update({ type: v })} options={[{ value: "", label: "All types" }, ...activityTypes]} />
          <div className="flex flex-col gap-2">
            <label htmlFor="ac-search" className="text-sm text-foreground">Search</label>
            <div className="relative">
              <SearchIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="ac-search" ref={searchRef} data-page-search value={qInput} onChange={(e) => onSearch(e.target.value)} placeholder="Plate, party, item, bill, ref" title="Search (/)" aria-keyshortcuts="/" autoComplete="off" className="pl-9" />
            </div>
          </div>
          {rangeId === "custom" && (
            <>
              <TextField id="ac-from" label="From" type="date" value={from || toDayInput((now) - 6 * DAY)} onChange={(v) => update({ from: v })} />
              <TextField id="ac-to" label="To" type="date" value={to || toDayInput(now)} onChange={(v) => update({ to: v })} />
            </>
          )}
        </div>

        <div className="flex min-h-10 flex-wrap items-center gap-2 px-(--card-spacing)">
          <p role="status" aria-live="polite" className="mr-2 text-sm tabular-nums text-muted-foreground">
            {result.status === "ready" ? `${result.data.total} events · Showing last ${config.retentionDays} days.` : `Showing last ${config.retentionDays} days.`}
          </p>
          <span data-print-hide className="flex flex-wrap gap-2">
            {chips.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-label={`Remove filter ${c.label}`}
                onClick={() => {
                  if (c.id === "q") setQInput("");
                  update(c.patch);
                }}
                className="inline-flex h-10 items-center gap-1.5 rounded-full bg-tag px-3 text-sm text-tag-foreground outline-none hover:bg-tag/70 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {c.label}
                <XIcon aria-hidden="true" className="size-3.5" />
              </button>
            ))}
            {chips.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => { setQInput(""); latest.current = ""; router.replace(pathname, { scroll: false }); }}>
                Clear all
              </Button>
            )}
          </span>
        </div>

        <div className="px-(--card-spacing)">
          {result.status === "loading" && (
            <div className={BODY} role="status" aria-label="Loading activity">
              {Array.from({ length: 9 }, (_, i) => (
                <div key={i} className="flex h-14 items-center gap-4">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              ))}
            </div>
          )}
          {result.status === "error" && <BlockError onRetry={result.retry} className={BODY} />}
          {result.status === "ready" && result.data.total === 0 && (
            <BlockEmpty icon={HistoryIcon} text="No activity in range." actionLabel="Clear filters" onAction={() => { setQInput(""); latest.current = ""; router.replace(pathname, { scroll: false }); }} className={BODY} />
          )}
          {result.status === "ready" && result.data.total > 0 && (
            <DataTable
              id="ac"
              caption="Activity across all roles"
              columns={activityColumns}
              rows={result.data.rows}
              rowKey={(e) => e.id}
              minWidth={420}
              actionLabel={(e) => `Actions for ${e.summary}`}
              actions={(e) => [{ label: "View", icon: EyeIcon, onSelect: () => setOpenEvent(e) }]}
            />
          )}
        </div>

        {result.status === "ready" && result.data.total > 0 && (
          <div data-print-hide className="px-(--card-spacing)">
            <TablePager
              id="ac"
              page={result.data.page}
              pages={result.data.pages}
              size={size}
              total={result.data.total}
              sizes={SIZES}
              onPage={(n) => update({ page: String(n) })}
              onSize={(n) => update({ size: n === 25 ? null : String(n) })}
            />
          </div>
        )}
      </Card>

      <SideDrawer
        open={!!openEvent}
        onClose={() => setOpenEvent(null)}
        wide
        title={openEvent ? typeLabel(openEvent.type) : ""}
        description={openEvent && (<><Pill tone={openEvent.role === "admin" ? "danger" : "brand"}>{roleLabel(openEvent.role)}</Pill><span>{openEvent.user}</span><span className="tabular-nums">{formatStamp(openEvent.at)}</span></>)}
        footer={openEvent?.href ? <Link href={openEvent.href} className="inline-flex h-10 items-center rounded-full border border-primary px-4 text-[15px] text-primary hover:bg-tag/40">Open record</Link> : undefined}
      >
        {openEvent && (
          <>
            <p className="text-[15px] text-foreground">{openEvent.summary}</p>
            {(openEvent.oldValue || openEvent.newValue) && (
              <section className="flex flex-col gap-3" aria-label="Change">
                <h3 className="text-heading-md text-foreground">Change</h3>
                <dl className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-card bg-muted p-4"><dt className="text-caption text-muted-foreground">Before</dt><dd className="text-[15px] break-words text-foreground">{openEvent.oldValue ?? "—"}</dd></div>
                  <div className="rounded-card bg-muted p-4"><dt className="text-caption text-muted-foreground">After</dt><dd className="text-[15px] break-words text-foreground">{openEvent.newValue ?? "—"}</dd></div>
                </dl>
              </section>
            )}
            <section className="flex flex-col gap-3" aria-label="Record">
              <h3 className="text-heading-md text-foreground">Record</h3>
              <dl className="flex flex-col gap-2">
                {openEvent.payload.filter(([, v]) => v).map(([k, v]) => (
                  <div key={k} className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
                    <dt className="text-caption text-muted-foreground sm:w-40 sm:shrink-0">{k}</dt>
                    <dd className="text-[15px] break-words text-foreground">{v}</dd>
                  </div>
                ))}
              </dl>
              {!openEvent.href && <p className="text-caption text-muted-foreground">This record belongs to another role&apos;s pages, so it is shown here in full.</p>}
            </section>
          </>
        )}
      </SideDrawer>
    </div>
  );
}
