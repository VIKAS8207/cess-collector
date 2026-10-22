"use client";

import type { StockLine } from "@/lib/domain/trader-types";
import { DataTable, type Column } from "@/components/ui/data-table";
import { useRef, useState } from "react";
import { BoxesIcon, EyeIcon, PlusIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/ui/pill";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockEmpty, BlockError } from "@/components/dashboard/block-states";
import { PageHeader } from "@/components/gate/page-header";
import { useToast } from "@/components/gate/toast";
import { StockPills } from "@/components/trader/pills";
import { StockDrawer } from "@/components/trader/stock/stock-drawer";
import { AddPurchaseDrawer } from "@/components/trader/stock/add-purchase";
import { useAuth } from "@/lib/auth-store";
import { getStockList } from "@/lib/api/trader";
import { forcedErrors } from "@/lib/api/gate";
import { formatDate, formatInr, formatQty } from "@/lib/format";
import { useLiveQuery } from "@/hooks/use-live-query";
import { useHotkey } from "@/hooks/use-hotkey";

type Source = "all" | "agent" | "manual";
type Status = "all" | "Remaining" | "Fully sold" | "Wastage";

const sourceOptions = [
  { value: "all", label: "All" },
  { value: "agent", label: "From agent" },
  { value: "manual", label: "Manual" },
] as const;
const statusOptions = [
  { value: "all", label: "All" },
  { value: "Remaining", label: "Remaining" },
  { value: "Fully sold", label: "Fully sold" },
  { value: "Wastage", label: "Wastage flagged" },
] as const;

const stockColumns: Column<StockLine>[] = [
  {
    key: "item",
    header: "Item",
    primary: true,
    cell: (x) => (
      <span className="flex flex-col">
        <span>{x.item}</span>
        <span className="text-caption text-muted-foreground">{x.unit}</span>
      </span>
    ),
  },
  { key: "qty", header: "Purchased", align: "right", hideBelow: "lg", cell: (x) => `${formatQty(x.qty)} ${x.unit}` },
  { key: "rate", header: "Rate", align: "right", hideBelow: "2xl", cell: (x) => formatInr(x.rate) },
  { key: "remaining", header: "Remaining", align: "right", cell: (x) => <span className="text-foreground">{formatQty(x.remaining)} {x.unit}</span> },
  {
    key: "source",
    header: "Source",
    hideBelow: "xl",
    cell: (x) =>
      x.source.kind === "agent" ? (
        <Pill tone="brand" title={`${x.source.agentName} · ${x.source.saleNo}`}>
          Agent · {x.source.agentName.split(" ")[0]}
        </Pill>
      ) : (
        <Pill tone="neutral" title={x.source.seller}>Manual</Pill>
      ),
  },
  { key: "date", header: "Date", hideBelow: "2xl", cell: (x) => <span className="text-caption tabular-nums text-muted-foreground">{formatDate(x.date)}</span> },
  { key: "status", header: "Status", cell: (x) => <StockPills line={x} /> },
];

const BODY = "h-[520px]";

export function StockPage() {
  const { user } = useAuth();
  const toast = useToast();
  const by = user?.name ?? "Trader";
  const searchRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<Source>("all");
  const [status, setStatus] = useState<Status>("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);

  const list = useLiveQuery(`stock:${source}:${status}:${q}`, (a) =>
    getStockList(
      { source: source === "all" ? undefined : source, status: status === "all" ? undefined : status, q },
      { forceError: a === 0 && forcedErrors().has("stock") }
    )
  );
  useHotkey("/", () => searchRef.current?.focus());

  const rows = list.status === "ready" ? list.data : [];
  const filtered = source !== "all" || status !== "all" || !!q;

  return (
    <div className="flex flex-col gap-8 lg:gap-10">
      <PageHeader
        title="My Stock"
        description="Everything you bought, from agents and outside the system."
        actions={
          <Button onClick={() => setAdding(true)}>
            <PlusIcon aria-hidden="true" />
            Add manual purchase
          </Button>
        }
      />

      <Card className="gap-4">
        <div className="flex flex-col gap-4 px-(--card-spacing)">
          <div className="flex flex-wrap gap-4">
            <Segmented label="Source" value={source} onChange={setSource} options={sourceOptions} className="max-w-full overflow-x-auto" />
            <Segmented label="Status" value={status} onChange={setStatus} options={statusOptions} className="max-w-full overflow-x-auto" />
          </div>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div className="flex flex-col gap-2">
              <label htmlFor="ms-search" className="text-sm text-foreground">Search</label>
              <div className="relative">
                <SearchIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="ms-search" ref={searchRef} data-page-search value={q} onChange={(e) => setQ(e.target.value)} placeholder="Item or seller" title="Search (/)" aria-keyshortcuts="/" autoComplete="off" className="pl-9" />
              </div>
            </div>
            <p role="status" aria-live="polite" className="text-sm tabular-nums text-muted-foreground sm:pb-2.5">
              {list.status === "ready" ? `${rows.length} stock lines` : "Loading stock"}
            </p>
          </div>
        </div>

        <div className="px-(--card-spacing)">
          {list.status === "loading" && (
            <div className={BODY} role="status" aria-label="Loading stock">
              <div className="flex h-10 items-center"><Skeleton className="h-4 w-32" /></div>
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="flex h-14 items-center gap-4">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
              ))}
            </div>
          )}
          {list.status === "error" && <BlockError onRetry={list.retry} className={BODY} />}
          {list.status === "ready" && rows.length === 0 && (
            <BlockEmpty
              icon={BoxesIcon}
              text={filtered ? "No stock matches these filters." : "No stock yet."}
              actionLabel={filtered ? "Clear filters" : "Add manual purchase"}
              onAction={() => {
                if (filtered) {
                  setSource("all");
                  setStatus("all");
                  setQ("");
                } else setAdding(true);
              }}
              className={BODY}
            />
          )}
          {list.status === "ready" && rows.length > 0 && (
            <DataTable
              id="ts"
              caption="Stock lines"
              columns={stockColumns}
              rows={rows}
              rowKey={(x) => x.id}
              highlightId={highlight}
              pageSize={10}
              minWidth={420}
              actionLabel={(x) => `Actions for ${x.item}`}
              actions={(x) => [{ label: "View", icon: EyeIcon, onSelect: () => setOpenId(x.id) }]}
            />
          )}
        </div>
      </Card>

      <StockDrawer id={openId} by={by} onClose={() => setOpenId(null)} />
      <AddPurchaseDrawer
        open={adding}
        by={by}
        onClose={() => setAdding(false)}
        onSaved={(id, label) => {
          setAdding(false);
          setHighlight(id);
          setTimeout(() => setHighlight((h) => (h === id ? null : h)), 3000);
          toast.push(`Purchase saved: ${label}.`);
        }}
      />
    </div>
  );
}
