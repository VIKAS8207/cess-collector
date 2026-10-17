"use client";

import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarIcon, PackageIcon, SearchIcon, ShoppingCartIcon } from "lucide-react";
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
import { forcedErrors } from "@/lib/api/gate";
import { saleCommission, saleSettlement, saleTotal } from "@/lib/domain/agent-store";
import { resolveRange, type RangePreset } from "@/lib/domain/range";
import type { LineStatus } from "@/lib/domain/agent-types";
import { formatInr, formatQty, formatStamp, formatTime } from "@/lib/format";
import { useAuth } from "@/lib/auth-store";
import { useLiveQuery } from "@/hooks/use-live-query";
import { ScanTruckButton } from "@/components/gate/scan-truck";
import { useHotkey } from "@/hooks/use-hotkey";
import { cn } from "cn";

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
        actions={
          <ScanTruckButton
            onFound={(m) => {
              setStatus("all");
              setQ(m.plate || m.fastag);
            }}
          />
        }
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
              actionLabel={filtered ? "Clear filters" : "Receive goods"}
              onAction={() => (filtered ? clearFilters() : router.push("/receive-goods"))}
              className={BODY}
            />
          )}
          {stock.status === "ready" && rows.length > 0 && (
            <div className={cn(BODY, "@container overflow-auto")}>
              <table className="w-full min-w-[420px] text-[15px]">
                <caption className="sr-only">Stock by received line</caption>
                <thead>
                  <tr className="h-10 border-b border-border text-left text-caption text-muted-foreground">
                    <th scope="col" className="font-normal">Receipt</th>
                    <th scope="col" className="font-normal">Item</th>
                    <th scope="col" className="hidden text-right font-normal @lg:table-cell">Received</th>
                    <th scope="col" className="hidden text-right font-normal @xl:table-cell">Sold</th>
                    <th scope="col" className="hidden text-right font-normal @2xl:table-cell">Returned</th>
                    <th scope="col" className="hidden text-right font-normal @2xl:table-cell">Wastage</th>
                    <th scope="col" className="text-right font-normal">Remaining</th>
                    <th scope="col" className="hidden pl-4 font-normal @3xl:table-cell">Received at</th>
                    <th scope="col" className="pl-4 font-normal">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={`${r.receipt.id}-${r.line.id}`}
                      onClick={() => r.stock.remaining > 0 && setPanel({ receiptId: r.receipt.id, lineId: r.line.id })}
                      className={cn(
                        "h-14 border-b border-border last:border-b-0",
                        r.stock.remaining > 0 ? "cursor-pointer hover:bg-muted" : "text-muted-foreground"
                      )}
                    >
                      <th scope="row" className="py-1 pr-3 text-left font-normal">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (r.stock.remaining > 0) setPanel({ receiptId: r.receipt.id, lineId: r.line.id });
                            else setReceiptId(r.receipt.id);
                          }}
                          className="flex flex-col rounded-field text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
                          <span>{r.receipt.plate || "No plate"}</span>
                          <span className="text-caption text-muted-foreground">{r.receipt.no}</span>
                        </button>
                      </th>
                      <td className="pr-3">
                        {r.line.item}
                        <span className="block text-caption text-muted-foreground">{r.line.unit}</span>
                      </td>
                      <td className="hidden text-right tabular-nums @lg:table-cell">{formatQty(r.stock.received)}</td>
                      <td className="hidden text-right tabular-nums @xl:table-cell">{formatQty(r.stock.sold)}</td>
                      <td className="hidden text-right tabular-nums @2xl:table-cell">{formatQty(r.stock.returned)}</td>
                      <td className="hidden text-right tabular-nums @2xl:table-cell">{formatQty(r.stock.wastage)}</td>
                      <td className="text-right tabular-nums text-foreground">{formatQty(r.stock.remaining)}</td>
                      <td className="hidden pl-4 text-caption tabular-nums text-muted-foreground @3xl:table-cell">
                        {formatTime(r.receipt.receivedAt)}
                      </td>
                      <td className="pl-4">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <LineStatusPill status={r.status} />
                          {r.receipt.mismatch && <Pill tone="danger">Mismatch</Pill>}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
            <div className={cn(BODY, "@container overflow-auto")}>
              <table className="w-full min-w-[420px] text-[15px]">
                <caption className="sr-only">Sales</caption>
                <thead>
                  <tr className="h-10 border-b border-border text-left text-caption text-muted-foreground">
                    <th scope="col" className="font-normal">Sale</th>
                    <th scope="col" className="font-normal">Party</th>
                    <th scope="col" className="hidden font-normal @xl:table-cell">Item</th>
                    <th scope="col" className="hidden text-right font-normal @2xl:table-cell">Qty × rate</th>
                    <th scope="col" className="text-right font-normal">Amount</th>
                    <th scope="col" className="hidden text-right font-normal @lg:table-cell">Commission</th>
                    <th scope="col" className="pl-4 font-normal">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {history.data.map((s) => {
                    const settle = saleSettlement(s);
                    const one = s.lines.length === 1 ? s.lines[0] : null;
                    return (
                      <tr key={s.id} onClick={() => setSaleId(s.id)} className="h-14 cursor-pointer border-b border-border last:border-b-0 hover:bg-muted">
                        <th scope="row" className="py-1 pr-3 text-left font-normal">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSaleId(s.id);
                            }}
                            className="flex flex-col rounded-field text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                          >
                            <span>{s.no}</span>
                            <span className="text-caption tabular-nums text-muted-foreground">{formatStamp(s.at)}</span>
                          </button>
                        </th>
                        <td className="max-w-40 truncate pr-3">{s.partyName}</td>
                        <td className="hidden max-w-40 truncate pr-3 @xl:table-cell">
                          {s.lines.map((l) => l.item).join(", ")}
                        </td>
                        <td className="hidden pr-3 text-right text-caption tabular-nums @2xl:table-cell">
                          {one ? `${formatQty(one.qty)} ${one.unit} × ${formatInr(one.rate)}` : `${s.lines.length} lines`}
                        </td>
                        <td className="text-right tabular-nums">{formatInr(saleTotal(s))}</td>
                        <td className="hidden text-right tabular-nums @lg:table-cell">{formatInr(saleCommission(s))}</td>
                        <td className="pl-4">
                          <Pill tone={settle === "Collected" ? "neutral" : "brand"}>{settle}</Pill>
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

