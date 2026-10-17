"use client";

import { SearchIcon, TruckIcon } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/ui/pill";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockEmpty, BlockError } from "@/components/dashboard/block-states";
import { ScanTruckButton } from "@/components/gate/scan-truck";
import { Dwell } from "@/components/gate/dwell";
import type { Query } from "@/hooks/use-live-query";
import { useNow } from "@/hooks/use-now";
import type { Movement } from "@/lib/domain/types";
import type { PickerVehicle } from "@/lib/api/agent";
import { normalizeId } from "@/lib/domain/store";
import { formatTime } from "@/lib/format";
import { cn } from "cn";

const BODY = "h-[340px]";

export function matchVehicles(list: PickerVehicle[], q: string) {
  const id = normalizeId(q);
  const text = q.trim().toLowerCase();
  if (!id) return list;
  return list.filter(
    ({ movement: m }) =>
      normalizeId(m.plate).includes(id) || normalizeId(m.fastag).includes(id) || m.driverName.toLowerCase().includes(text)
  );
}

export function VehiclePicker({
  query,
  q,
  onQuery,
  onEnter,
  searchRef,
  selectedId,
  onSelect,
  onOpenReceipt,
  onClear,
  onScanned,
}: {
  query: Query<PickerVehicle[]>;
  q: string;
  onQuery: (v: string) => void;
  onEnter: () => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
  selectedId: string | null;
  onSelect: (v: PickerVehicle) => void;
  onOpenReceipt: (receiptId: string) => void;
  onClear: () => void;
  onScanned: (m: Movement) => void;
}) {
  const now = useNow(30_000);
  const rows = query.status === "ready" ? matchVehicles(query.data, q) : [];

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="text-heading-md">1. Vehicles at gate</CardTitle>
        <CardDescription>Pick the truck you are unloading</CardDescription>
      </CardHeader>
      <div className="flex flex-col gap-3 px-(--card-spacing)">
        <label htmlFor="rv-search" className="sr-only">
          Search plate, FASTag or driver
        </label>
        <div className="relative">
          <SearchIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="rv-search"
            ref={searchRef}
            data-page-search
            value={q}
            onChange={(e) => onQuery(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onEnter();
              }
            }}
            autoComplete="off"
            spellCheck={false}
            placeholder="Scan or search plate, FASTag, driver"
            title="Search (/)"
            aria-keyshortcuts="/"
            className="pl-9"
          />
        </div>
        <div>
          <ScanTruckButton onFound={onScanned} label="Scan truck QR" />
        </div>

        {query.status === "loading" && (
          <div className={BODY} role="status" aria-label="Loading vehicles">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex h-14 items-center gap-4">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            ))}
          </div>
        )}
        {query.status === "error" && <BlockError onRetry={query.retry} className={BODY} />}
        {query.status === "ready" && query.data.length === 0 && (
          <BlockEmpty icon={TruckIcon} text="No vehicles at the gate." actionLabel="Clear selection" onAction={onClear} className={BODY} />
        )}
        {query.status === "ready" && query.data.length > 0 && rows.length === 0 && (
          <BlockEmpty icon={SearchIcon} text="No vehicle matches your search." actionLabel="Clear search" onAction={() => onQuery("")} className={BODY} />
        )}
        {query.status === "ready" && rows.length > 0 && (
          <div className={cn(BODY, "@container overflow-auto")}>
            <table className="w-full min-w-[320px]">
              <caption className="sr-only">Vehicles at the gate</caption>
              <thead>
                <tr className="h-10 border-b border-border text-left text-caption text-muted-foreground">
                  <th scope="col" className="font-normal">Plate</th>
                  <th scope="col" className="hidden font-normal @md:table-cell">Driver</th>
                  <th scope="col" className="font-normal">Entry</th>
                  <th scope="col" className="hidden font-normal @lg:table-cell">Dwell</th>
                  <th scope="col" className="hidden font-normal @xl:table-cell">Transporter</th>
                  <th scope="col" className="font-normal">
                    <span className="sr-only">Status</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => {
                  const m = v.movement;
                  const selected = selectedId === m.id;
                  return (
                    <tr
                      key={m.id}
                      onClick={() => (v.receipt ? onOpenReceipt(v.receipt.id) : onSelect(v))}
                      className={cn(
                        "h-14 cursor-pointer border-b border-border text-[15px] last:border-b-0 hover:bg-muted",
                        selected && "bg-tag/40"
                      )}
                    >
                      <th scope="row" className="py-1 pr-3 text-left font-normal">
                        <button
                          type="button"
                          aria-pressed={selected}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (v.receipt) onOpenReceipt(v.receipt.id);
                            else onSelect(v);
                          }}
                          className="flex flex-col rounded-field text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
                          <span>{m.plate || m.fastag || "No plate"}</span>
                          <span className="text-caption text-muted-foreground @md:hidden">{m.driverName}</span>
                        </button>
                      </th>
                      <td className="hidden max-w-32 truncate pr-3 @md:table-cell">{m.driverName}</td>
                      <td className="pr-3 text-caption tabular-nums text-muted-foreground">{m.entryAt ? formatTime(m.entryAt) : "—"}</td>
                      <td className="hidden pr-3 text-caption @lg:table-cell">
                        <Dwell ms={m.entryAt && now ? (m.exitAt ?? now) - m.entryAt : null} open={m.status === "Inside"} />
                      </td>
                      <td className="hidden max-w-32 truncate pr-3 text-caption text-muted-foreground @xl:table-cell">{m.transporter || "—"}</td>
                      <td>
                        {v.receipt ? (
                          <Pill tone="neutral">Receipt exists</Pill>
                        ) : m.status === "Flagged" ? (
                          <Pill tone="danger">Flagged</Pill>
                        ) : m.status === "Exited" ? (
                          <Pill tone="neutral">Exited</Pill>
                        ) : (
                          <Pill tone="brand">Inside</Pill>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}
