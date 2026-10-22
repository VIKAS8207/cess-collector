"use client";

import { DataTable, type Column } from "@/components/ui/data-table";
import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarIcon, EyeIcon, PackageIcon, SearchIcon, ShoppingCartIcon } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/ui/pill";
import { SelectField } from "@/components/ui/select-field";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockEmpty, BlockError } from "@/components/dashboard/block-states";
import { PageHeader } from "@/components/gate/page-header";
import { useToast } from "@/components/gate/toast";
import { LineStatusPill } from "@/components/agent/pills";
import { ReceiptDrawer } from "@/components/agent/receipt-drawer";
import { SalePanel } from "@/components/sales/sale-panel";
import { SaleDetailDrawer } from "@/components/sales/sale-detail-drawer";
import { getSalesHistory, getStock } from "@/lib/api/agent";
import type { StockRow } from "@/lib/domain/agent-store";
import { forcedErrors } from "@/lib/api/gate";
import { saleCommission, saleSettlement, saleTotal } from "@/lib/domain/agent-store";
import { resolveRange, type RangePreset } from "@/lib/domain/range";
import type { LineStatus, Sale } from "@/lib/domain/agent-types";
import { formatInr, formatQty, formatStamp, formatTime } from "@/lib/format";
import { useAuth } from "@/lib/auth-store";
import { useLiveQuery } from "@/hooks/use-live-query";
import { useHotkey } from "@/hooks/use-hotkey";

type StatusFilter = "all" | LineStatus;

const statusOptions = [
  { value: "all", label: "All" },
  { value: "Waiting", label: "Waiting for sale" },
  { value: "Partly sold", label: "Partly sold" },
  { value: "Sold", label: "Sold" },
] as const;

const rangeOptions = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

const stockColumns: Column<StockRow>[] = [
  {
    key: "receipt",
    header: "Receipt",
    primary: true,
    cell: (r) => (
      <span className="flex flex-col">
        <span>{r.receipt.plate || "No plate"}</span>
        <span className="text-caption text-muted-foreground">{r.receipt.no}</span>
      </span>
    ),
  },
  {
    key: "item",
    header: "Item",
    cell: (r) => (
      <>
        {r.line.item}
        <span className="block text-caption text-muted-foreground">{r.line.unit}</span>
      </>
    ),
  },
  { key: "received", header: "Received", align: "right", hideBelow: "lg", cell: (r) => formatQty(r.stock.received) },
  { key: "sold", header: "Sold", align: "right", hideBelow: "xl", cell: (r) => formatQty(r.stock.sold) },
  { key: "returned", header: "Returned", align: "right", hideBelow: "2xl", cell: (r) => formatQty(r.stock.returned) },
  { key: "wastage", header: "Wastage", align: "right", hideBelow: "2xl", cell: (r) => formatQty(r.stock.wastage) },
  { key: "remaining", header: "Remaining", align: "right", cell: (r) => <span className="text-foreground">{formatQty(r.stock.remaining)}</span> },
  { key: "at", header: "Received at", hideBelow: "2xl", cell: (r) => <span className="text-caption tabular-nums text-muted-foreground">{formatTime(r.receipt.receivedAt)}</span> },
  {
    key: "status",
    header: "Status",
    cell: (r) => (
      <span className="flex items-center gap-1.5">
        <LineStatusPill status={r.status} />
        {r.receipt.mismatch && <Pill tone="danger">Mismatch</Pill>}
      </span>
    ),
  },
];

const saleColumns: Column<Sale>[] = [
  {
    key: "sale",
    header: "Sale",
    primary: true,
    cell: (x) => (
      <span className="flex flex-col">
        <span>{x.no}</span>
        <span className="text-caption tabular-nums text-muted-foreground">{formatStamp(x.at)}</span>
      </span>
    ),
  },
  { key: "party", header: "Party", cell: (x) => <span className="block max-w-40 truncate">{x.partyName}</span> },
  { key: "item", header: "Item", hideBelow: "xl", cell: (x) => <span className="block max-w-40 truncate">{x.lines.map((l) => l.item).join(", ")}</span> },
  {
    key: "qty",
    header: "Qty × rate",
    align: "right",
    hideBelow: "2xl",
    cell: (x) => {
      const one = x.lines.length === 1 ? x.lines[0] : null;
      return <span className="text-caption">{one ? `${formatQty(one.qty)} ${one.unit} × ${formatInr(one.rate)}` : `${x.lines.length} lines`}</span>;
    },
  },
  { key: "amount", header: "Amount", align: "right", cell: (x) => formatInr(saleTotal(x)) },
  { key: "commission", header: "Commission", align: "right", hideBelow: "lg", cell: (x) => formatInr(saleCommission(x)) },
  {
    key: "status",
    header: "Status",
    cell: (x) => {
      const settle = saleSettlement(x);
      return <Pill tone={settle === "Collected" ? "neutral" : "brand"}>{settle}</Pill>;
    },
  },
];

const BODY = "h-[440px]";

export function SalesPage() {
  const { user } = useAuth();
  const toast = useToast();
  const params = useSearchParams();
  const router = useRouter();
  const agent = user?.name ?? "Agent";
  const searchRef = useRef<HTMLInputElement>(null);

  const [status, setStatus] = useState<StatusFilter>("all");
  const [q, setQ] = useState(params.get("q") ?? "");
  const [range, setRange] = useState<RangePreset>("7d");
  const [panel, setPanel] = useState<{ receiptId: string; lineId?: string } | null>(
    params.get("receipt") ? { receiptId: params.get("receipt")! } : null
  );
  const [saleId, setSaleId] = useState<string | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);

  const stock = useLiveQuery(`stock:${status}:${q}`, (a) =>
    getStock(
      { status: status === "all" ? undefined : status, q },
      { forceError: a === 0 && forcedErrors().has("stock") }
    )
  );
  const history = useLiveQuery(`sales:${range}:${q}`, (a) =>
    getSalesHistory(resolveRange(range, Date.now()), q, { forceError: a === 0 && forcedErrors().has("sales") })
  );

  useHotkey("/", () => searchRef.current?.focus());

  const clearFilters = () => {
    setStatus("all");
    setQ("");
  };

  const rows = stock.status === "ready" ? stock.data : [];
  const filtered = status !== "all" || q;

  return (
    <div className="flex flex-col gap-8 lg:gap-10">
      <PageHeader
        title="Sales"
        description="Sell stock from received lots. Partial sales are fine."
      />

      <Card className="gap-4">
        <div className="flex flex-col gap-4 px-(--card-spacing)">
          <Segmented
            label="Stock status"
            value={status}
            onChange={setStatus}
            options={statusOptions}
            className="max-w-full self-start overflow-x-auto"
          />
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div className="flex flex-col gap-2">
              <label htmlFor="s-search" className="text-sm text-foreground">
                Search
              </label>
              <div className="relative">
                <SearchIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="s-search"
                  ref={searchRef}
                  data-page-search
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Plate, item, receipt or party"
                  title="Search (/)"
                  aria-keyshortcuts="/"
                  autoComplete="off"
                  className="pl-9"
                />
              </div>
            </div>
            <p role="status" aria-live="polite" className="text-sm tabular-nums text-muted-foreground sm:pb-2.5">
              {stock.status === "ready" ? `${rows.length} stock lines` : "Loading stock"}
            </p>
          </div>
        </div>

        <div className="px-(--card-spacing)">
          {stock.status === "loading" && (
            <div className={BODY} role="status" aria-label="Loading stock">
              <div className="flex h-10 items-center">
                <Skeleton className="h-4 w-32" />
              </div>
              {Array.from({ length: 7 }, (_, i) => (
                <div key={i} className="flex h-14 items-center gap-4">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
              ))}
            </div>
          )}
          {stock.status === "error" && <BlockError onRetry={stock.retry} className={BODY} />}
          {stock.status === "ready" && rows.length === 0 && (
            <BlockEmpty
              icon={PackageIcon}
              text={filtered ? "No stock matches these filters." : "No stock pending."}
              actionLabel={filtered ? "Clear filters" : "Allocate to traders"}
              onAction={() => (filtered ? clearFilters() : router.push("/allocations"))}
              className={BODY}
            />
          )}
          {stock.status === "ready" && rows.length > 0 && (
            <DataTable
              id="st"
              caption="Stock by received line"
              columns={stockColumns}
              rows={rows}
              rowKey={(r) => `${r.receipt.id}-${r.line.id}`}
              pageSize={10}
              minWidth={420}
              actionLabel={(r) => `Actions for ${r.receipt.no}`}
              actions={(r) => [
                { label: "Record sale", icon: ShoppingCartIcon, disabled: r.stock.remaining <= 0, onSelect: () => setPanel({ receiptId: r.receipt.id, lineId: r.line.id }) },
                { label: "View receipt", icon: EyeIcon, onSelect: () => setReceiptId(r.receipt.id) },
              ]}
            />
          )}
        </div>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-heading-md">Sale history</CardTitle>
          <CardDescription>Newest first. Open a sale to record a return.</CardDescription>
        </CardHeader>
        <div className="px-(--card-spacing)">
          <SelectField
            id="s-range"
            label="Date range"
            hideLabel
            icon={<CalendarIcon aria-hidden="true" />}
            value={range}
            onChange={(v) => setRange(v as RangePreset)}
            options={rangeOptions}
            className="max-w-56"
          />
        </div>
        <div className="px-(--card-spacing)">
          {history.status === "loading" && (
            <div className={BODY} role="status" aria-label="Loading sale history">
              <div className="flex h-10 items-center">
                <Skeleton className="h-4 w-32" />
              </div>
              {Array.from({ length: 7 }, (_, i) => (
                <div key={i} className="flex h-14 items-center gap-4">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
              ))}
            </div>
          )}
          {history.status === "error" && <BlockError onRetry={history.retry} className={BODY} />}
          {history.status === "ready" && history.data.length === 0 && (
            <BlockEmpty icon={ShoppingCartIcon} text="No sales in this range." actionLabel="Show last 30 days" onAction={() => setRange("30d")} className={BODY} />
          )}
          {history.status === "ready" && history.data.length > 0 && (
            <DataTable
              id="sh"
              caption="Sales"
              columns={saleColumns}
              rows={history.data}
              rowKey={(x) => x.id}
              pageSize={10}
              minWidth={420}
              actionLabel={(x) => `Actions for ${x.no}`}
              actions={(x) => [{ label: "View", icon: EyeIcon, onSelect: () => setSaleId(x.id) }]}
            />
          )}
        </div>
      </Card>

      <SalePanel
        receiptId={panel?.receiptId ?? null}
        focusLineId={panel?.lineId}
        agent={agent}
        onClose={() => setPanel(null)}
        onDone={(no) => {
          setPanel(null);
          toast.push(`Sale ${no} recorded.`);
          requestAnimationFrame(() => searchRef.current?.focus());
        }}
      />
      <SaleDetailDrawer id={saleId} agent={agent} onClose={() => setSaleId(null)} />
      <ReceiptDrawer id={receiptId} onClose={() => setReceiptId(null)} />
    </div>
  );
}

