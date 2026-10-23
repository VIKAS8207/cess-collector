"use client";

import { DataTable, type Column } from "@/components/ui/data-table";
import { useEffect, useRef, useState } from "react";
import { PrintBusiness } from "@/components/gate/print-business";
import { useSearchParams } from "next/navigation";
import { EyeIcon, CalendarIcon, SearchIcon, WalletIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select-field";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockEmpty, BlockError } from "@/components/dashboard/block-states";
import { PageHeader } from "@/components/gate/page-header";
import { SideDrawer } from "@/components/gate/side-drawer";
import { BuyerPill } from "@/components/trader/pills";
import { BuyerDrawer } from "@/components/trader/collections/buyer-drawer";
import { useAuth } from "@/lib/auth-store";
import { buyerDetail, getCollections, getCessMovements, type BuyerRow, type CessMovement } from "@/lib/api/trader";
import { forcedErrors } from "@/lib/api/gate";
import { describeRange, resolveRange, type RangePreset } from "@/lib/domain/range";
import { CESS_LABEL } from "@/lib/domain/trader-types";
import { formatInr, formatStamp } from "@/lib/format";
import { useLiveQuery } from "@/hooks/use-live-query";
import { useHotkey } from "@/hooks/use-hotkey";
import { useNow } from "@/hooks/use-now";
import { cn } from "cn";

const buyerColumns: Column<BuyerRow>[] = [
  {
    key: "buyer",
    header: "Buyer",
    primary: true,
    cell: (r) => (
      <span className="flex flex-col">
        <span>{r.buyer.name}</span>
        <span className="text-caption tabular-nums text-muted-foreground">{r.buyer.phone}</span>
      </span>
    ),
  },
  { key: "bills", header: "Bills", align: "right", hideBelow: "2xl", cell: (r) => r.bills },
  { key: "goods", header: "Goods due", align: "right", hideBelow: "xl", cell: (r) => formatInr(r.goodsDue) },
  { key: "cess", header: "CESS due", align: "right", hideBelow: "xl", cell: (r) => formatInr(r.cessDue) },
  { key: "paid", header: "Paid", align: "right", hideBelow: "2xl", cell: (r) => <span className="text-muted-foreground">{formatInr(r.paid)}</span> },
  { key: "due", header: "Balance due", align: "right", cell: (r) => <span className="text-foreground">{formatInr(r.totalDue)}</span> },
  { key: "status", header: "Status", cell: (r) => <BuyerPill status={r.status} /> },
];

const BODY = "h-[480px]";
const rangeOptions = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

type CessView = "computed" | "collected" | "pending";

function CessStat({ label, value, onClick, active }: { label: string; value: number; onClick: () => void; active: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex min-h-24 flex-col items-start gap-1 rounded-card border border-border bg-background p-4 text-left shadow-card outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
        active && "border-primary"
      )}
    >
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-display-md tabular-nums text-foreground">{formatInr(value)}</span>
    </button>
  );
}

export function CollectionsPage() {
  const { user } = useAuth();
  const params = useSearchParams();
  const by = user?.name ?? "Trader";
  const now = useNow(60_000);
  const searchRef = useRef<HTMLInputElement>(null);
  const [range, setRange] = useState<RangePreset>("30d");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(params.get("buyer"));
  const billId = params.get("bill") ?? undefined;
  const [cessView, setCessView] = useState<CessView | null>(null);
  const [stmt, setStmt] = useState<string | null>(null);

  const data = useLiveQuery(`coll:${range}:${q}`, (a) =>
    getCollections(resolveRange(range, Date.now()), q, { forceError: a === 0 && forcedErrors().has("collections") })
  );
  const movements = useLiveQuery(`cess:${range}:${cessView}`, (a) =>
    cessView ? getCessMovements(resolveRange(range, Date.now()), cessView, { forceError: a === 0 && forcedErrors().has("cess") }) : Promise.resolve([] as CessMovement[])
  );
  useHotkey("/", () => searchRef.current?.focus());

  // Print the statement once it is on screen, then bring the page back.
  useEffect(() => {
    if (!stmt) return;
    const done = () => setStmt(null);
    window.addEventListener("afterprint", done, { once: true });
    const t = setTimeout(() => window.print(), 150);
    return () => {
      clearTimeout(t);
      window.removeEventListener("afterprint", done);
    };
  }, [stmt]);

  const rows = data.status === "ready" ? data.data.rows : [];
  const rangeLabel = describeRange(resolveRange(range, now));
  const stmtDetail = stmt && now ? buyerDetail(stmt, now) : null;

  return (
    <>
      <div className="flex flex-col gap-8 lg:gap-10" {...(stmt ? { "data-print-hide": true } : {})}>
        <PageHeader title="Collections" description="Who owes you, and how much of it is CESS." />

        <section aria-label="CESS summary" className="flex flex-col gap-3">
          <div className="grid gap-4 sm:grid-cols-3">
            {data.status === "ready" ? (
              <>
                <CessStat label={`${CESS_LABEL} computed`} value={data.data.cess.computed} active={cessView === "computed"} onClick={() => setCessView("computed")} />
                <CessStat label={`${CESS_LABEL} collected`} value={data.data.cess.collected} active={cessView === "collected"} onClick={() => setCessView("collected")} />
                <CessStat label={`${CESS_LABEL} pending`} value={data.data.cess.pending} active={cessView === "pending"} onClick={() => setCessView("pending")} />
              </>
            ) : (
              [0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-card" />)
            )}
          </div>
          <p className="text-caption text-muted-foreground">
            {rangeLabel}. Select a figure to see the movements behind it. Pending is across all buyers.
          </p>
        </section>

        <Card className="gap-4">
          <div className="grid gap-4 px-(--card-spacing) sm:grid-cols-2">
            <SelectField id="co-range" label="Date range" icon={<CalendarIcon aria-hidden="true" />} value={range} onChange={(v) => setRange(v as RangePreset)} options={rangeOptions} />
            <div className="flex flex-col gap-2">
              <label htmlFor="co-search" className="text-sm text-foreground">Search buyers</label>
              <div className="relative">
                <SearchIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="co-search" ref={searchRef} data-page-search value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or phone" title="Search (/)" aria-keyshortcuts="/" autoComplete="off" className="pl-9" />
              </div>
            </div>
          </div>

          <div className="px-(--card-spacing)">
            {data.status === "loading" && (
              <div className={BODY} role="status" aria-label="Loading buyer balances">
                <div className="flex h-10 items-center"><Skeleton className="h-4 w-32" /></div>
                {Array.from({ length: 7 }, (_, i) => (
                  <div key={i} className="flex h-14 items-center gap-4">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                ))}
              </div>
            )}
            {data.status === "error" && <BlockError onRetry={data.retry} className={BODY} />}
            {data.status === "ready" && rows.length === 0 && (
              <BlockEmpty icon={WalletIcon} text={q ? "No buyer matches your search." : "No buyers with dues."} actionLabel={q ? "Clear search" : "Show last 30 days"} onAction={() => (q ? setQ("") : setRange("30d"))} className={BODY} />
            )}
            {data.status === "ready" && rows.length > 0 && (
              <DataTable
                id="co"
                caption="Buyer balances"
                columns={buyerColumns}
                rows={rows}
                rowKey={(r) => r.buyer.id}
                pageSize={10}
                minWidth={420}
                actionLabel={(r) => `Actions for ${r.buyer.name}`}
                actions={(r) => [{ label: "View", icon: EyeIcon, onSelect: () => setOpenId(r.buyer.id) }]}
              />
            )}
          </div>
        </Card>

        <BuyerDrawer id={openId} billId={billId} by={by} onClose={() => setOpenId(null)} onPrint={setStmt} />

        <SideDrawer
          open={!!cessView}
          onClose={() => setCessView(null)}
          title={cessView ? `${CESS_LABEL} ${cessView}` : ""}
          description={cessView === "pending" ? "All buyers, as of now" : rangeLabel}
        >
          {cessView && movements.status === "loading" && (
            <div role="status" aria-label="Loading CESS movements" className="flex flex-col gap-3">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          )}
          {cessView && movements.status === "error" && <BlockError onRetry={movements.retry} className="h-48" />}
          {cessView && movements.status === "ready" && movements.data.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing here for this range.</p>
          )}
          {cessView && movements.status === "ready" && movements.data.length > 0 && (
            <>
              <ul className="flex flex-col">
                {movements.data.map((m) => (
                  <li key={m.id} className="flex items-baseline justify-between gap-3 border-b border-border py-3">
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[15px] text-foreground">{m.buyer}</span>
                      <span className="text-caption text-muted-foreground">{m.label}{m.at ? ` · ${formatStamp(m.at)}` : ""}</span>
                    </span>
                    <span className="tabular-nums text-foreground">{formatInr(m.amount)}</span>
                  </li>
                ))}
              </ul>
              <p className="flex justify-between text-[15px]">
                <span className="text-muted-foreground">Total</span>
                <span className="tabular-nums text-foreground">{formatInr(movements.data.reduce((a, m) => a + m.amount, 0))}</span>
              </p>
            </>
          )}
        </SideDrawer>
      </div>

      {stmtDetail && (
        <div className="hidden print:block">
        <PrintBusiness />
          <h1 className="text-display-md">Statement: {stmtDetail.buyer.name}</h1>
          <p className="mb-4 text-sm">{rangeLabel} · Generated by {by} on {formatStamp(now)}</p>
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-2 font-normal">Entry</th>
                <th className="py-2 text-right font-normal">Goods</th>
                <th className="py-2 text-right font-normal">CESS</th>
                <th className="py-2 text-right font-normal">Balance</th>
              </tr>
            </thead>
            <tbody>
              {stmtDetail.ledger.map((e) => (
                <tr key={e.id} className="border-b border-border align-top">
                  <td className="py-2">
                    {e.label}
                    {e.at > 0 && <span className="block text-[12px]">{formatStamp(e.at)}</span>}
                  </td>
                  <td className="py-2 text-right tabular-nums">{e.goods ? formatInr(e.goods) : "—"}</td>
                  <td className="py-2 text-right tabular-nums">{e.cess ? formatInr(e.cess) : "—"}</td>
                  <td className="py-2 text-right tabular-nums">{formatInr(e.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4 text-right text-[15px]">
            Closing balance: <span className="tabular-nums">{formatInr(stmtDetail.finance.totalDue)}</span> (goods {formatInr(stmtDetail.finance.goodsDue)} + CESS {formatInr(stmtDetail.finance.cessDue)})
          </p>
        </div>
      )}
    </>
  );
}
