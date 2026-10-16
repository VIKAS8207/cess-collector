import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockError } from "@/components/dashboard/block-states";
import { CARD, GRID, KpiCard } from "@/components/dashboard/kpi-row";
import type { Query } from "@/hooks/use-live-query";
import { dominantUnit, type AgentKpis } from "@/lib/api/agent";
import type { Unit } from "@/lib/domain/agent-types";
import { formatInr, formatNumber, formatQty } from "@/lib/format";

type Totals = Partial<Record<Unit, number>>;

/** One headline number for a mix of units: the biggest unit, with a note for the rest. */
function qtyText(t: Totals): { value: string; note?: string } {
  const main = dominantUnit(t);
  if (!main) return { value: "0" };
  const others = (Object.keys(t) as Unit[]).filter((u) => u !== main && (t[u] ?? 0) > 0);
  return {
    value: `${formatQty(t[main] ?? 0)} ${main}`,
    note: others.length ? `+ ${others.map((u) => `${formatQty(t[u]!)} ${u}`).join(", ")}` : undefined,
  };
}

export function AgentKpiRow({ query }: { query: Query<AgentKpis> }) {
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
  const recv = qtyText(k.received);
  const sold = qtyText(k.sold);
  return (
    <ul className={GRID} aria-label="Key figures">
      <li className="contents">
        <KpiCard label="Vehicles received today" value={formatNumber(k.vehicles)} delta={k.vehiclesDelta} />
      </li>
      <li className="contents">
        <KpiCard label="Quantity received today" value={recv.value} delta={recv.note ? undefined : k.receivedDelta} note={recv.note} />
      </li>
      <li className="contents">
        <KpiCard label="Quantity sold today" value={sold.value} delta={sold.note ? undefined : k.soldDelta} note={sold.note} />
      </li>
      <li className="contents">
        <KpiCard
          label="Stock pending"
          value={`${formatNumber(k.lots)} ${k.lots === 1 ? "lot" : "lots"}`}
          note={k.topStock ? `Most: ${formatQty(k.topStock.qty)} ${k.topStock.unit} ${k.topStock.item}` : "Nothing waiting"}
        />
      </li>
      <li className="contents">
        <KpiCard label="Commission earned today" value={formatInr(Math.round(k.commission))} delta={k.commissionDelta} />
      </li>
      <li className="contents">
        <Card className="h-[132px] justify-between gap-0 p-5 [--card-spacing:--spacing(5)]">
          <p className="h-5 text-sm text-muted-foreground">Balances</p>
          <dl className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-caption text-muted-foreground">To receive</dt>
              <dd className="text-[17px] tabular-nums text-foreground">{formatInr(k.toReceive)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-caption text-muted-foreground">To pay</dt>
              <dd className="text-[17px] tabular-nums text-foreground">{formatInr(k.toPay)}</dd>
            </div>
          </dl>
          <p className="h-4 text-caption text-muted-foreground">Traders owe · you owe sellers</p>
        </Card>
      </li>
    </ul>
  );
}
