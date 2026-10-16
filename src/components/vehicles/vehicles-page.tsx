"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarIcon, SearchIcon, TruckIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select-field";
import { TextField } from "@/components/auth/text-field";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockEmpty, BlockError } from "@/components/dashboard/block-states";
import { Dwell } from "@/components/gate/dwell";
import { PageHeader } from "@/components/gate/page-header";
import { StatusPill } from "@/components/gate/status-pill";
import { MovementDrawer } from "@/components/gate/movement-drawer";
import { forcedErrors, listMovements, type Filters } from "@/lib/api/gate";
import { resolveRange, toDayInput, type RangePreset } from "@/lib/domain/range";
import {
  purposes,
  statuses,
  vehicleTypes,
  type Purpose,
  type Status,
  type VehicleType,
} from "@/lib/domain/types";
import { formatStamp } from "@/lib/format";
import { useLiveQuery } from "@/hooks/use-live-query";
import { useNow } from "@/hooks/use-now";
import { useHotkey } from "@/hooks/use-hotkey";
import { cn } from "cn";

const DEFAULT_RANGE = "30d";
const PAGE_SIZES = ["25", "50", "100"];
const BODY = "min-h-[600px]";

const rangeOptions = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom range" },
];

export function VehiclesPage() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const now = useNow(30_000);
  const searchRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [openId, setOpenId] = useState<string | null>(null);
  const [qInput, setQInput] = useState(params.get("q") ?? "");
  // Latest query string, so debounced and rapid updates never overwrite each other.
  const latest = useRef(params.toString());
  useEffect(() => {
    latest.current = params.toString();
  }, [params]);

  const status = statuses.find((s) => s === params.get("status"));
  const type = vehicleTypes.find((s) => s === params.get("type"));
  const purpose = purposes.find((s) => s === params.get("purpose"));
  const q = params.get("q") ?? "";
  const rangeId = params.get("range") ?? DEFAULT_RANGE;
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const size = PAGE_SIZES.includes(params.get("size") ?? "") ? Number(params.get("size")) : 25;

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

  const onSearch = (value: string) => {
    setQInput(value.toUpperCase());
    clearTimeout(timer.current);
    timer.current = setTimeout(() => update({ q: value.trim() }), 250);
  };

  const clearAll = () => {
    clearTimeout(timer.current);
    setQInput("");
    latest.current = "";
    router.replace(pathname, { scroll: false });
  };

  const key = params.toString();
  const result = useLiveQuery(`list:${key}`, (attempt) => {
    const t = Date.now();
    const range =
      rangeId === "all"
        ? { from: 0, to: Number.MAX_SAFE_INTEGER }
        : resolveRange(rangeId as RangePreset, t, { from, to });
    const filters: Filters = { range, status, type, purpose, q };
    return listMovements(filters, page, size, {
      forceError: attempt === 0 && forcedErrors().has("list"),
    });
  });

  useHotkey("/", () => searchRef.current?.focus());

  const chips: { id: string; label: string; patch: Record<string, string | null> }[] = [];
  if (status) chips.push({ id: "status", label: `Status: ${status}`, patch: { status: null } });
  if (type) chips.push({ id: "type", label: `Type: ${type}`, patch: { type: null } });
  if (purpose) chips.push({ id: "purpose", label: `Purpose: ${purpose}`, patch: { purpose: null } });
  if (q) chips.push({ id: "q", label: `Search: ${q}`, patch: { q: null } });
  if (rangeId !== DEFAULT_RANGE)
    chips.push({
      id: "range",
      label: `Range: ${rangeOptions.find((r) => r.value === rangeId)?.label ?? rangeId}`,
      patch: { range: null, from: null, to: null },
    });

  return (
    <div className="flex flex-col gap-8 lg:gap-10">
      <PageHeader title="All Vehicles" description="Every entry and exit in one list." />

      <Card className="gap-5">
        <div className="flex flex-col gap-4 px-(--card-spacing)">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]">
            <div className="flex flex-col gap-2 sm:col-span-2 xl:col-span-1">
              <label htmlFor="v-search" className="text-sm text-foreground">
                Search
              </label>
              <div className="relative">
                <SearchIcon
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  id="v-search"
                  ref={searchRef}
                  data-page-search
                  value={qInput}
                  onChange={(e) => onSearch(e.target.value)}
                  placeholder="Plate, FASTag or driver"
                  title="Search (/)"
                  aria-keyshortcuts="/"
                  autoComplete="off"
                  spellCheck={false}
                  className="pl-9"
                />
              </div>
            </div>
            <SelectField
              id="v-range"
              label="Date range"
              icon={<CalendarIcon aria-hidden="true" />}
              value={rangeId}
              onChange={(v) => update({ range: v === DEFAULT_RANGE ? null : v, from: null, to: null })}
              options={rangeOptions}
            />
            <SelectField
              id="v-status"
              label="Status"
              value={status ?? ""}
              onChange={(v) => update({ status: v })}
              options={[{ value: "", label: "All" }, ...statuses.map((s) => ({ value: s, label: s }))]}
            />
            <SelectField
              id="v-type"
              label="Vehicle type"
              value={type ?? ""}
              onChange={(v) => update({ type: v })}
              options={[{ value: "", label: "All" }, ...vehicleTypes.map((s) => ({ value: s, label: s }))]}
            />
            <SelectField
              id="v-purpose"
              label="Purpose"
              value={purpose ?? ""}
              onChange={(v) => update({ purpose: v })}
              options={[{ value: "", label: "All" }, ...purposes.map((s) => ({ value: s, label: s }))]}
            />
          </div>

          {rangeId === "custom" && (
            <div className="grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField
                id="v-from"
                label="From"
                type="date"
                value={from || toDayInput(now - 6 * 86_400_000)}
                max={to || undefined}
                onChange={(v) => update({ from: v })}
              />
              <TextField
                id="v-to"
                label="To"
                type="date"
                value={to || toDayInput(now)}
                min={from || undefined}
                onChange={(v) => update({ to: v })}
              />
            </div>
          )}

          <div className="flex min-h-10 flex-wrap items-center gap-2">
            <p role="status" aria-live="polite" className="mr-2 text-sm tabular-nums text-muted-foreground">
              {result.status === "ready" ? `${result.data.total} records` : "Loading records"}
            </p>
            {chips.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  if (c.id === "q") setQInput("");
                  update(c.patch);
                }}
                aria-label={`Remove filter ${c.label}`}
                className="inline-flex h-10 items-center gap-1.5 rounded-full bg-tag px-3 text-sm text-tag-foreground outline-none hover:bg-tag/70 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {c.label}
                <XIcon aria-hidden="true" className="size-3.5" />
              </button>
            ))}
            {chips.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearAll}>
                Clear all
              </Button>
            )}
          </div>
        </div>

        <div className="px-(--card-spacing)">
          {result.status === "loading" && (
            <div className={BODY} role="status" aria-label="Loading records">
              <div className="flex h-10 items-center">
                <Skeleton className="h-4 w-32" />
              </div>
              {Array.from({ length: 9 }, (_, i) => (
                <div key={i} className="flex h-14 items-center gap-4">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              ))}
            </div>
          )}
          {result.status === "error" && <BlockError onRetry={result.retry} className={BODY} />}
          {result.status === "ready" && result.data.total === 0 && (
            <BlockEmpty
              icon={TruckIcon}
              text="No records match these filters."
              actionLabel="Clear filters"
              onAction={clearAll}
              className={BODY}
            />
          )}
          {result.status === "ready" && result.data.total > 0 && (
            <div className={cn(BODY, "@container overflow-x-auto")}>
              <table className="w-full min-w-[420px]">
                <caption className="sr-only">All vehicle movements</caption>
                <thead>
                  <tr className="h-10 border-b border-border text-left text-caption text-muted-foreground">
                    <th scope="col" className="font-normal">Plate</th>
                    <th scope="col" className="hidden font-normal @4xl:table-cell">FASTag</th>
                    <th scope="col" className="hidden font-normal @md:table-cell">Driver</th>
                    <th scope="col" className="hidden font-normal @2xl:table-cell">Type</th>
                    <th scope="col" className="hidden font-normal @5xl:table-cell">Transporter</th>
                    <th scope="col" className="font-normal">Entry</th>
                    <th scope="col" className="hidden font-normal @xl:table-cell">Exit</th>
                    <th scope="col" className="font-normal">Status</th>
                    <th scope="col" className="text-right font-normal">Dwell</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.rows.map((m) => (
                    <tr
                      key={m.id}
                      onClick={() => setOpenId(m.id)}
                      className="h-14 cursor-pointer border-b border-border text-[15px] last:border-b-0 hover:bg-muted"
                    >
                      <th scope="row" className="py-1 pr-3 text-left font-normal">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenId(m.id);
                          }}
                          className="rounded-field text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
                          {m.plate || "No plate"}
                        </button>
                      </th>
                      <td className="hidden max-w-36 truncate pr-3 text-caption tabular-nums text-muted-foreground @4xl:table-cell">
                        {m.fastag || "—"}
                      </td>
                      <td className="hidden max-w-36 truncate pr-3 @md:table-cell">{m.driverName}</td>
                      <td className="hidden pr-3 @2xl:table-cell">{m.vehicleType}</td>
                      <td className="hidden max-w-36 truncate pr-3 @5xl:table-cell">{m.transporter || "—"}</td>
                      <td className="pr-3 text-caption tabular-nums text-muted-foreground">
                        {m.entryAt ? formatStamp(m.entryAt) : "—"}
                      </td>
                      <td className="hidden pr-3 text-caption tabular-nums text-muted-foreground @xl:table-cell">
                        {m.exitAt ? formatStamp(m.exitAt) : "—"}
                      </td>
                      <td className="pr-3">
                        <StatusPill movement={m} />
                      </td>
                      <td className="text-right text-caption">
                        {m.entryAt ? (
                          <Dwell
                            ms={(m.exitAt ?? now) - m.entryAt}
                            open={m.status === "Inside"}
                          />
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {result.status === "ready" && result.data.total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border px-(--card-spacing) pt-4">
            <p className="text-sm tabular-nums text-muted-foreground">
              {(result.data.page - 1) * result.data.size + 1}-
              {Math.min(result.data.page * result.data.size, result.data.total)} of {result.data.total}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <SelectField
                id="v-size"
                label="Rows per page"
                hideLabel
                value={String(size)}
                onChange={(v) => update({ size: v === "25" ? null : v })}
                options={PAGE_SIZES.map((s) => ({ value: s, label: `${s} per page` }))}
              />
              <Button
                variant="outline"
                disabled={result.data.page <= 1}
                onClick={() => update({ page: String(result.data.page - 1) })}
              >
                Previous
              </Button>
              <span className="text-sm tabular-nums text-muted-foreground">
                Page {result.data.page} of {result.data.pages}
              </span>
              <Button
                variant="outline"
                disabled={result.data.page >= result.data.pages}
                onClick={() => update({ page: String(result.data.page + 1) })}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      <MovementDrawer id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

export type { Status, VehicleType, Purpose };
