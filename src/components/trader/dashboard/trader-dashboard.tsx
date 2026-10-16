"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarIcon, PlusIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { PageHeader } from "@/components/gate/page-header";
import { StockDrawer } from "@/components/trader/stock/stock-drawer";
import { TraderKpiRow } from "@/components/trader/dashboard/trader-kpis";
import { TraderChart } from "@/components/trader/dashboard/trader-chart";
import {
  PendingCard,
  StockWaitingCard,
  TraderAttentionCard,
  TraderRecentCard,
} from "@/components/trader/dashboard/trader-lists";
import { useLiveQuery } from "@/hooks/use-live-query";
import { useNow } from "@/hooks/use-now";
import { useAuth } from "@/lib/auth-store";
import {
  getPendingCollections,
  getStockWaiting,
  getTraderAttention,
  getTraderKpis,
  getTraderRecent,
  getTraderSeries,
} from "@/lib/api/trader";
import { forcedErrors } from "@/lib/api/gate";
import { rangePresets, resolveRange, type RangePreset } from "@/lib/domain/range";
import { activeGate } from "@/lib/domain/settings";
import { formatDate } from "@/lib/format";

const shiftOf = (now: number) => {
  const h = new Date(now).getHours();
  return h >= 6 && h < 14 ? "Morning" : h >= 14 && h < 22 ? "Evening" : "Night";
};
const greeting = (now: number) => {
  const h = new Date(now).getHours();
  return h >= 5 && h < 12 ? "Good morning" : h >= 12 && h < 17 ? "Good afternoon" : "Good evening";
};

export function TraderDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const now = useNow(60_000);
  const [preset, setPreset] = useState<RangePreset>("today");
  const [stockId, setStockId] = useState<string | null>(null);
  const label = rangePresets.find((r) => r.id === preset)?.label ?? "";
  const by = user?.name ?? "Trader";

  const opts = (name: string, attempt: number) => ({ forceError: attempt === 0 && forcedErrors().has(name) });

  const kpis = useLiveQuery(`t-kpis:${preset}`, (a) => getTraderKpis(resolveRange(preset, Date.now()), opts("kpis", a)));
  const series = useLiveQuery(`t-series:${preset}`, (a) => getTraderSeries(resolveRange(preset, Date.now()), opts("chart", a)));
  const waiting = useLiveQuery("t-waiting", (a) => getStockWaiting(opts("stock", a)));
  const pending = useLiveQuery("t-pending", (a) => getPendingCollections(opts("pending", a)));
  const attention = useLiveQuery("t-attention", (a) => getTraderAttention(opts("attention", a)));
  const recent = useLiveQuery("t-recent", (a) => getTraderRecent(opts("recent", a)));

  return (
    <div className="flex flex-col gap-8 lg:gap-10">
      <PageHeader
        title={now ? `${greeting(now)}, ${user?.name.split(" ")[0] ?? ""}` : "Dashboard"}
        description={now ? `${formatDate(now)} · ${shiftOf(now)} shift · ${activeGate()} · ${user?.name}` : undefined}
        actions={
          <>
            <SelectField
              id="t-range"
              label="Date range"
              hideLabel
              icon={<CalendarIcon aria-hidden="true" />}
              value={preset}
              onChange={(v) => setPreset(v as RangePreset)}
              options={rangePresets.map((r) => ({ value: r.id, label: r.label }))}
            />
            <Link href="/sales?new=1" className={buttonVariants()}>
              <PlusIcon aria-hidden="true" />
              New sale
            </Link>
          </>
        }
      />

      <TraderKpiRow query={kpis} rangeLabel={label} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <TraderChart query={series} rangeLabel={label} onReset={() => setPreset("30d")} />
        </div>
        <TraderAttentionCard
          query={attention}
          onOpen={(a) => {
            if (a.kind === "overdue" || a.kind === "saas-adjust") router.push(`/collections?buyer=${a.buyerId}`);
            else if (a.stockId) setStockId(a.stockId);
          }}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <StockWaitingCard query={waiting} onOpen={setStockId} />
        <PendingCard query={pending} />
      </div>

      <TraderRecentCard
        query={recent}
        onOpen={(e) => {
          if (e.kind === "payment" && e.buyerId) router.push(`/collections?buyer=${e.buyerId}`);
          else if (e.billId) router.push(`/sales?bill=${e.billId}`);
          else if (e.stockId) setStockId(e.stockId);
        }}
      />

      <StockDrawer id={stockId} by={by} onClose={() => setStockId(null)} />
    </div>
  );
}
