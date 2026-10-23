import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockError } from "@/components/dashboard/block-states";
import { CARD, GRID, KpiCard } from "@/components/dashboard/kpi-row";
import type { Query } from "@/hooks/use-live-query";
import type { TraderKpis } from "@/lib/api/trader";
import { formatInr, formatNumber, formatQty } from "@/lib/format";

export function TraderKpiRow({ query, rangeLabel }: { query: Query<TraderKpis>; rangeLabel: string }) {
  if (query.status === "loading") {
    return (
      <div className={GRID} role="status" aria-label="Loading key figures">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Card key={i} className={CARD} aria-hidden="true">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-5 w-36" />
          </Card>
        ))}
      </div>
    );
  }
  if (query.status === "error") {
    return (
      <Card className="h-[132px] justify-center">
        <BlockError onRetry={query.retry} className="h-full" />
      </Card>
    );
  }
  const k = query.data;
  const sub = rangeLabel.toLowerCase();
  return (
    <ul className={GRID} aria-label="Key figures">
      <li className="contents">
        <KpiCard label={`Purchased value · ${sub}`} value={formatInr(k.purchased)} delta={k.purchasedDelta} />
      </li>
      <li className="contents">
        <KpiCard label={`Sold value · ${sub}`} value={formatInr(k.sold)} delta={k.soldDelta} />
      </li>
      <li className="contents">
        <KpiCard label={`CESS computed · ${sub}`} value={formatInr(k.cessComputed)} delta={k.cessComputedDelta} />
      </li>
      <li className="contents">
        <KpiCard label={`CESS collected · ${sub}`} value={formatInr(k.cessCollected)} delta={k.cessCollectedDelta} />
      </li>
      <li className="contents">
        <KpiCard label="CESS pending" value={formatInr(k.cessPending)} note="Across all buyers" />
      </li>
      <li className="contents">
        <KpiCard
          label="Stock left"
          value={`${formatNumber(k.lots)} ${k.lots === 1 ? "line" : "lines"}`}
          note={k.top ? `Most: ${formatQty(k.top.qty)} ${k.top.unit} ${k.top.item}` : "Nothing in stock"}
        />
      </li>
    </ul>
  );
}
