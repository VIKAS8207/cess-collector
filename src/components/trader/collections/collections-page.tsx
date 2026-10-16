"use client";

import { useEffect, useRef, useState } from "react";
import { PrintBusiness } from "@/components/gate/print-business";
import { useSearchParams } from "next/navigation";
import { CalendarIcon, SearchIcon, WalletIcon } from "lucide-react";
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
import { buyerDetail, getCollections, getSaasMovements, type SaasMovement } from "@/lib/api/trader";
import { forcedErrors } from "@/lib/api/gate";
import { describeRange, resolveRange, type RangePreset } from "@/lib/domain/range";
import { SAAS_LABEL } from "@/lib/domain/trader-types";
import { formatInr, formatStamp } from "@/lib/format";
import { useLiveQuery } from "@/hooks/use-live-query";
import { useHotkey } from "@/hooks/use-hotkey";
import { useNow } from "@/hooks/use-now";
import { cn } from "cn";

const BODY = "h-[480px]";
const rangeOptions = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

type SaasView = "computed" | "collected" | "pending";

function SaasStat({ label, value, onClick, active }: { label: string; value: number; onClick: () => void; active: boolean }) {
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
  const [saasView, setSaasView] = useState<SaasView | null>(null);
  const [stmt, setStmt] = useState<string | null>(null);

  const data = useLiveQuery(`coll:${range}:${q}`, (a) =>
    getCollections(resolveRange(range, Date.now()), q, { forceError: a === 0 && forcedErrors().has("collections") })
  );
  const movements = useLiveQuery(`saas:${range}:${saasView}`, (a) =>
    saasView ? getSaasMovements(resolveRange(range, Date.now()), saasView, { forceError: a === 0 && forcedErrors().has("saas") }) : Promise.resolve([] as SaasMovement[])
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
        <PageHeader title="Collections" description="Who owes you, and how much of it is saas." />

        <section aria-label="Saas summary" className="flex flex-col gap-3">
          <div className="grid gap-4 sm:grid-cols-3">
            {data.status === "ready" ? (
              <>
                <SaasStat label={`${SAAS_LABEL} computed`} value={data.data.saas.computed} active={saasView === "computed"} onClick={() => setSaasView("computed")} />
                <SaasStat label={`${SAAS_LABEL} collected`} value={data.data.saas.collected} active={saasView === "collected"} onClick={() => setSaasView("collected")} />
                <SaasStat label={`${SAAS_LABEL} pending`} value={data.data.saas.pending} active={saasView === "pending"} onClick={() => setSaasView("pending")} />
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
              <div className={cn(BODY, "@container overflow-auto")}>
                <table className="w-full min-w-[420px] text-[15px]">
                  <caption className="sr-only">Buyer balances</caption>
                  <thead>
                    <tr className="h-10 border-b border-border text-left text-caption text-muted-foreground">
                      <th scope="col" className="font-normal">Buyer</th>
                      <th scope="col" className="hidden text-right font-normal @2xl:table-cell">Bills</th>
                      <th scope="col" className="hidden text-right font-normal @xl:table-cell">Goods due</th>
                      <th scope="col" className="hidden text-right font-normal @xl:table-cell">Saas due</th>
                      <th scope="col" className="hidden text-right font-normal @2xl:table-cell">Paid</th>
                      <th scope="col" className="text-right font-normal">Balance due</th>
                      <th scope="col" className="pl-4 font-normal">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.buyer.id} onClick={() => setOpenId(r.buyer.id)} className="h-14 cursor-pointer border-b border-border last:border-b-0 hover:bg-muted">
                        <th scope="row" className="py-1 pr-3 text-left font-normal">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenId(r.buyer.id);
                            }}
                            className="flex flex-col rounded-field text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                          >
                            <span>{r.buyer.name}</span>
                            <span className="text-caption tabular-nums text-muted-foreground">{r.buyer.phone}</span>
                          </button>
                        </th>
                        <td className="hidden text-right tabular-nums @2xl:table-cell">{r.bills}</td>
                        <td className="hidden text-right tabular-nums @xl:table-cell">{formatInr(r.goodsDue)}</td>
                        <td className="hidden text-right tabular-nums @xl:table-cell">{formatInr(r.saasDue)}</td>
                        <td className="hidden text-right tabular-nums text-muted-foreground @2xl:table-cell">{formatInr(r.paid)}</td>
                        <td className="text-right tabular-nums text-foreground">{formatInr(r.totalDue)}</td>
                        <td className="pl-4"><BuyerPill status={r.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>

        <BuyerDrawer id={openId} billId={billId} by={by} onClose={() => setOpenId(null)} onPrint={setStmt} />

        <SideDrawer
          open={!!saasView}
          onClose={() => setSaasView(null)}
          title={saasView ? `${SAAS_LABEL} ${saasView}` : ""}
          description={saasView === "pending" ? "All buyers, as of now" : rangeLabel}
        >
          {saasView && movements.status === "loading" && (
            <div role="status" aria-label="Loading saas movements" className="flex flex-col gap-3">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          )}
          {saasView && movements.status === "error" && <BlockError onRetry={movements.retry} className="h-48" />}
          {saasView && movements.status === "ready" && movements.data.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing here for this range.</p>
          )}
          {saasView && movements.status === "ready" && movements.data.length > 0 && (
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
                <th className="py-2 text-right font-normal">Saas</th>
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
                  <td className="py-2 text-right tabular-nums">{e.saas ? formatInr(e.saas) : "—"}</td>
                  <td className="py-2 text-right tabular-nums">{formatInr(e.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4 text-right text-[15px]">
            Closing balance: <span className="tabular-nums">{formatInr(stmtDetail.finance.totalDue)}</span> (goods {formatInr(stmtDetail.finance.goodsDue)} + saas {formatInr(stmtDetail.finance.saasDue)})
          </p>
        </div>
      )}
    </>
  );
}
