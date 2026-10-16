"use client";

import { useRef, useState } from "react";
import { BoxesIcon, PlusIcon, SearchIcon } from "lucide-react";
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
import { cn } from "cn";

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
            <div className={cn(BODY, "@container overflow-auto")}>
              <table className="w-full min-w-[420px] text-[15px]">
                <caption className="sr-only">Stock lines</caption>
                <thead>
                  <tr className="h-10 border-b border-border text-left text-caption text-muted-foreground">
                    <th scope="col" className="font-normal">Item</th>
                    <th scope="col" className="hidden text-right font-normal @lg:table-cell">Purchased</th>
                    <th scope="col" className="hidden text-right font-normal @2xl:table-cell">Rate</th>
                    <th scope="col" className="text-right font-normal">Remaining</th>
                    <th scope="col" className="hidden pl-4 font-normal @xl:table-cell">Source</th>
                    <th scope="col" className="hidden pl-4 font-normal @3xl:table-cell">Date</th>
                    <th scope="col" className="pl-4 font-normal">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr
                      key={s.id}
                      onClick={() => setOpenId(s.id)}
                      className={cn("cursor-pointer border-b border-border transition-colors duration-700 last:border-b-0 hover:bg-muted", highlight === s.id && "bg-tag/40")}
                    >
                      <th scope="row" className="py-3 pr-3 text-left font-normal">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenId(s.id);
                          }}
                          className="flex flex-col rounded-field text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
                          <span>{s.item}</span>
                          <span className="text-caption text-muted-foreground">{s.unit}</span>
                        </button>
                      </th>
                      <td className="hidden text-right tabular-nums @lg:table-cell">{formatQty(s.qty)} {s.unit}</td>
                      <td className="hidden text-right tabular-nums @2xl:table-cell">{formatInr(s.rate)}</td>
                      <td className="text-right tabular-nums text-foreground">{formatQty(s.remaining)} {s.unit}</td>
                      <td className="hidden pl-4 @xl:table-cell">
                        {s.source.kind === "agent" ? (
                          <Pill tone="brand" title={`${s.source.agentName} · ${s.source.saleNo}`}>
                            Agent · {s.source.agentName.split(" ")[0]}
                          </Pill>
                        ) : (
                          <Pill tone="neutral" title={s.source.seller}>Manual</Pill>
                        )}
                      </td>
                      <td className="hidden pl-4 text-caption tabular-nums text-muted-foreground @3xl:table-cell">{formatDate(s.date)}</td>
                      <td className="pl-4"><StockPills line={s} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
