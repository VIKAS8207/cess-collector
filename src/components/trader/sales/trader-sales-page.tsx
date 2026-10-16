"use client";

import { useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarIcon, CircleCheckIcon, PlusIcon, SearchIcon, ShoppingCartIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select-field";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockEmpty, BlockError } from "@/components/dashboard/block-states";
import { PageHeader } from "@/components/gate/page-header";
import { useToast } from "@/components/gate/toast";
import { BillPill } from "@/components/trader/pills";
import { BillForm } from "@/components/trader/sales/bill-form";
import { BillDrawer } from "@/components/trader/sales/bill-drawer";
import { useAuth } from "@/lib/auth-store";
import { getBillHistory, getTodayBills, listBuyers } from "@/lib/api/trader";
import { forcedErrors } from "@/lib/api/gate";
import { resolveRange, type RangePreset } from "@/lib/domain/range";
import { billStatus } from "@/lib/domain/trader-store";
import type { Bill, BillStatus } from "@/lib/domain/trader-types";
import { formatInr, formatStamp, formatTime } from "@/lib/format";
import { useLiveQuery } from "@/hooks/use-live-query";
import { useHotkey } from "@/hooks/use-hotkey";
import { cn } from "cn";

type View = "form" | "bills";
const BODY = "h-[420px]";
const rangeOptions = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

function BillsTable({ rows, onOpen, highlight, showDate }: { rows: Bill[]; onOpen: (id: string) => void; highlight?: string | null; showDate?: boolean }) {
  return (
    <div className="@container h-full overflow-auto">
      <table className="w-full min-w-[360px] text-[15px]">
        <caption className="sr-only">Bills</caption>
        <thead>
          <tr className="h-10 border-b border-border text-left text-caption text-muted-foreground">
            <th scope="col" className="font-normal">Bill</th>
            <th scope="col" className="font-normal">Buyer</th>
            <th scope="col" className="hidden text-right font-normal @lg:table-cell">Lines</th>
            <th scope="col" className="hidden text-right font-normal @xl:table-cell">Goods</th>
            <th scope="col" className="hidden text-right font-normal @xl:table-cell">Saas</th>
            <th scope="col" className="text-right font-normal">Payable</th>
            <th scope="col" className="pl-4 font-normal">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr
              key={b.id}
              onClick={() => onOpen(b.id)}
              className={cn("h-14 cursor-pointer border-b border-border transition-colors duration-700 last:border-b-0 hover:bg-muted", highlight === b.id && "bg-tag/40")}
            >
              <th scope="row" className="py-1 pr-3 text-left font-normal">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(b.id);
                  }}
                  className="flex flex-col rounded-field text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span className="tabular-nums">{b.no}</span>
                  <span className="text-caption tabular-nums text-muted-foreground">{showDate ? formatStamp(b.at) : formatTime(b.at)}</span>
                </button>
              </th>
              <td className="max-w-36 truncate pr-3">{b.buyerName}</td>
              <td className="hidden text-right tabular-nums @lg:table-cell">{b.lines.length}</td>
              <td className="hidden text-right tabular-nums @xl:table-cell">{formatInr(b.goods)}</td>
              <td className="hidden text-right tabular-nums @xl:table-cell">{formatInr(b.saas)}</td>
              <td className="text-right tabular-nums text-foreground">{formatInr(b.payable)}</td>
              <td className="pl-4"><BillPill status={billStatus(b)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TraderSalesPage() {
  const { user } = useAuth();
  const toast = useToast();
  const params = useSearchParams();
  const trader = user?.name ?? "Trader";
  const searchRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<View>("form");
  const [formKey, setFormKey] = useState(0);
  const [saved, setSaved] = useState<Bill | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(params.get("bill"));
  const presetStock = params.get("stock") ?? undefined;

  // history filters
  const [range, setRange] = useState<RangePreset>("30d");
  const [buyerId, setBuyerId] = useState("");
  const [status, setStatus] = useState<BillStatus | "">("");
  const [q, setQ] = useState("");

  const today = useLiveQuery("t-bills-today", (a) => getTodayBills({ forceError: a === 0 && forcedErrors().has("bills") }));
  const history = useLiveQuery(`t-bills:${range}:${buyerId}:${status}:${q}`, (a) =>
    getBillHistory(
      { range: resolveRange(range, Date.now()), buyerId: buyerId || undefined, status: status || undefined, q },
      { forceError: a === 0 && forcedErrors().has("history") }
    )
  );

  const startNew = () => {
    setSaved(null);
    setFormKey((k) => k + 1);
    setView("form");
    requestAnimationFrame(() => document.getElementById("bf-buyer-search")?.focus());
  };
  useHotkey("n", startNew);
  useHotkey("/", () => searchRef.current?.focus());

  const onSaved = (b: Bill) => {
    setSaved(b);
    setHighlight(b.id);
    setTimeout(() => setHighlight((h) => (h === b.id ? null : h)), 3000);
    toast.push(`Bill ${b.no} recorded for ${b.buyerName}.`);
  };

  return (
    <div className="flex flex-col gap-8 lg:gap-10">
      <PageHeader title="Sales" description="Make a bill. Saas is added to what the buyer pays." />

      <Segmented
        label="Section"
        value={view}
        onChange={setView}
        className="lg:hidden"
        options={[
          { value: "form", label: "Form" },
          { value: "bills", label: "Bills" },
        ]}
      />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
        <div className={cn("flex flex-col gap-4", view !== "form" && "max-lg:hidden")}>
          {saved && (
            <div role="status" className="flex items-start gap-3 rounded-card border border-border bg-background p-4 text-sm shadow-card">
              <CircleCheckIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
              <p className="text-foreground">
                Bill <span className="tabular-nums">{saved.no}</span> recorded. Buyer payable{" "}
                <span className="tabular-nums">{formatInr(saved.payable)}</span> (goods {formatInr(saved.goods)} + saas {formatInr(saved.saas)}).
              </p>
            </div>
          )}
          <BillForm key={formKey} trader={trader} presetStockId={presetStock} onSaved={onSaved} />
        </div>

        <Card className={cn("gap-4", view !== "bills" && "max-lg:hidden")}>
          <CardHeader>
            <CardTitle className="text-heading-md">Today&apos;s bills</CardTitle>
            <CardDescription>{today.status === "ready" ? `${today.data.length} so far` : "Newest first"}</CardDescription>
            <CardAction>
              <Button onClick={startNew} title="New bill (N)" aria-keyshortcuts="N">
                <PlusIcon aria-hidden="true" />
                New bill
              </Button>
            </CardAction>
          </CardHeader>
          <div className="px-(--card-spacing)">
            {today.status === "loading" && (
              <div className={BODY} role="status" aria-label="Loading today's bills">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex h-14 items-center gap-4">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                ))}
              </div>
            )}
            {today.status === "error" && <BlockError onRetry={today.retry} className={BODY} />}
            {today.status === "ready" && today.data.length === 0 && (
              <BlockEmpty icon={ShoppingCartIcon} text="No bills yet today." actionLabel="Start a bill" onAction={startNew} className={BODY} />
            )}
            {today.status === "ready" && today.data.length > 0 && (
              <div className={BODY}>
                <BillsTable rows={today.data} onOpen={setOpenId} highlight={highlight} />
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-heading-md">Bill history</CardTitle>
          <CardDescription>
            {history.status === "ready" ? `${history.data.length} bills` : "Filter by date, buyer or status"}
          </CardDescription>
        </CardHeader>
        <div className="grid gap-4 px-(--card-spacing) sm:grid-cols-2 xl:grid-cols-4">
          <SelectField id="bh-range" label="Date range" icon={<CalendarIcon aria-hidden="true" />} value={range} onChange={(v) => setRange(v as RangePreset)} options={rangeOptions} />
          <SelectField id="bh-buyer" label="Buyer" value={buyerId} onChange={setBuyerId} options={[{ value: "", label: "All buyers" }, ...listBuyers().map((b) => ({ value: b.id, label: b.name }))]} />
          <SelectField id="bh-status" label="Status" value={status} onChange={(v) => setStatus(v as BillStatus | "")} options={[{ value: "", label: "All" }, { value: "Unpaid", label: "Unpaid" }, { value: "Partly paid", label: "Partly paid" }, { value: "Paid", label: "Paid" }]} />
          <div className="flex flex-col gap-2">
            <label htmlFor="bh-search" className="text-sm text-foreground">Search</label>
            <div className="relative">
              <SearchIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="bh-search" ref={searchRef} data-page-search value={q} onChange={(e) => setQ(e.target.value)} placeholder="Bill number or item" title="Search (/)" aria-keyshortcuts="/" autoComplete="off" className="pl-9" />
            </div>
          </div>
        </div>
        <div className="px-(--card-spacing)">
          {history.status === "loading" && (
            <div className={BODY} role="status" aria-label="Loading bill history">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="flex h-14 items-center gap-4">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              ))}
            </div>
          )}
          {history.status === "error" && <BlockError onRetry={history.retry} className={BODY} />}
          {history.status === "ready" && history.data.length === 0 && (
            <BlockEmpty
              icon={ShoppingCartIcon}
              text="No bills match these filters."
              actionLabel="Clear filters"
              onAction={() => {
                setRange("30d");
                setBuyerId("");
                setStatus("");
                setQ("");
              }}
              className={BODY}
            />
          )}
          {history.status === "ready" && history.data.length > 0 && (
            <div className={BODY}>
              <BillsTable rows={history.data} onOpen={setOpenId} showDate />
            </div>
          )}
        </div>
      </Card>

      <BillDrawer id={openId} by={trader} onClose={() => setOpenId(null)} />
    </div>
  );
}
