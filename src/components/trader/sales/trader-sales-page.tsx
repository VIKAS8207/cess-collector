"use client";

import { DataTable, type Column } from "@/components/ui/data-table";
import { useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarIcon, CircleCheckIcon, EyeIcon, PlusIcon, SearchIcon, ShoppingCartIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select-field";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockEmpty, BlockError } from "@/components/dashboard/block-states";
import { PageHeader } from "@/components/gate/page-header";
import { useToast } from "@/components/gate/toast";
import { RevealPanel, useReveal } from "@/components/gate/reveal-panel";
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

const BODY = "h-[420px]";
const rangeOptions = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

const billColumns = (showDate?: boolean): Column<Bill>[] => [
  {
    key: "bill",
    header: "Bill",
    primary: true,
    cell: (b) => (
      <span className="flex flex-col">
        <span className="tabular-nums">{b.no}</span>
        <span className="text-caption tabular-nums text-muted-foreground">{showDate ? formatStamp(b.at) : formatTime(b.at)}</span>
      </span>
    ),
  },
  { key: "buyer", header: "Buyer", cell: (b) => <span className="block max-w-36 truncate">{b.buyerName}</span> },
  { key: "lines", header: "Lines", align: "right", hideBelow: "lg", cell: (b) => b.lines.length },
  { key: "goods", header: "Goods", align: "right", hideBelow: "xl", cell: (b) => formatInr(b.goods) },
  { key: "cess", header: "CESS", align: "right", hideBelow: "xl", cell: (b) => formatInr(b.cess) },
  { key: "payable", header: "Payable", align: "right", cell: (b) => <span className="text-foreground">{formatInr(b.payable)}</span> },
  { key: "status", header: "Status", cell: (b) => <BillPill status={billStatus(b)} /> },
];

function BillsTable({ id, rows, onOpen, highlight, showDate }: { id: string; rows: Bill[]; onOpen: (id: string) => void; highlight?: string | null; showDate?: boolean }) {
  return (
    <DataTable
      id={id}
      caption="Bills"
      columns={billColumns(showDate)}
      rows={rows}
      rowKey={(b) => b.id}
      highlightId={highlight}
      pageSize={10}
      minWidth={360}
      actionLabel={(b) => `Actions for ${b.no}`}
      actions={(b) => [{ label: "View", icon: EyeIcon, onSelect: () => onOpen(b.id) }]}
    />
  );
}

export function TraderSalesPage() {
  const { user } = useAuth();
  const toast = useToast();
  const params = useSearchParams();
  const trader = user?.name ?? "Trader";
  const searchRef = useRef<HTMLInputElement>(null);
  const newButton = useRef<HTMLButtonElement>(null);
  const presetStock = params.get("stock") ?? undefined;
  // Arriving from "New sale" or "Record sale" opens the form straight away.
  const reveal = useReveal("bf-buyer-search", params.get("new") === "1" || !!presetStock);
  const [saved, setSaved] = useState<Bill | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(params.get("bill"));

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
    reveal.open();
  };
  const closeForm = () => {
    reveal.close();
    newButton.current?.focus();
  };
  useHotkey("n", startNew);
  useHotkey("/", () => searchRef.current?.focus());

  const onSaved = (b: Bill) => {
    setSaved(b);
    setHighlight(b.id);
    setTimeout(() => setHighlight((h) => (h === b.id ? null : h)), 3000);
    toast.push(`Bill ${b.no} recorded for ${b.buyerName}.`);
    closeForm();
  };

  return (
    <div className="flex flex-col gap-8 lg:gap-10">
      <PageHeader
        title="Sales"
        description="Make a bill. CESS is added to what the buyer pays."
        actions={
          <Button
            ref={newButton}
            onClick={startNew}
            aria-expanded={reveal.expanded}
            aria-controls="bill-form-panel"
            title="New bill (N)"
            aria-keyshortcuts="N"
          >
            <PlusIcon aria-hidden="true" />
            New bill
          </Button>
        }
      />

      <RevealPanel id="bill-form-panel" mounted={reveal.mounted} expanded={reveal.expanded} title="New bill" onCancel={closeForm}>
        <BillForm key={reveal.key} trader={trader} presetStockId={presetStock} onSaved={onSaved} />
      </RevealPanel>

      {saved && (
        <div role="status" className="flex items-start gap-3 rounded-card border border-border bg-background p-4 text-sm shadow-card">
          <CircleCheckIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
          <p className="text-foreground">
            Bill <span className="tabular-nums">{saved.no}</span> recorded. Buyer payable{" "}
            <span className="tabular-nums">{formatInr(saved.payable)}</span> (goods {formatInr(saved.goods)} + CESS {formatInr(saved.cess)}).
          </p>
        </div>
      )}

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-heading-md">Today&apos;s bills</CardTitle>
          <CardDescription>{today.status === "ready" ? `${today.data.length} so far, newest first` : "Newest first"}</CardDescription>
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
              <BillsTable id="tb-today" rows={today.data} onOpen={setOpenId} highlight={highlight} />
            </div>
          )}
        </div>
      </Card>

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
              <BillsTable id="tb-hist" rows={history.data} onOpen={setOpenId} showDate />
            </div>
          )}
        </div>
      </Card>

      <BillDrawer id={openId} by={trader} onClose={() => setOpenId(null)} />
    </div>
  );
}
