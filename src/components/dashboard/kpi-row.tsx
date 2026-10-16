import { ArrowDownRightIcon, ArrowUpRightIcon, MinusIcon, TriangleAlertIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockError } from "@/components/dashboard/block-states";
import type { Query } from "@/hooks/use-live-query";
import type { DashboardKpis } from "@/lib/api/gate";
import { formatDelta, formatNumber } from "@/lib/format";
import { formatDuration } from "@/lib/format";
import { cn } from "cn";

export const CARD = "h-[132px] justify-between gap-0 p-5 [--card-spacing:--spacing(5)]";
export const GRID = "grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr))]";

export function Delta({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <p className="flex items-center gap-1 text-caption text-muted-foreground">
        <MinusIcon aria-hidden="true" className="size-4" />
        No data yesterday
      </p>
    );
  }
  const up = value > 0.05;
  const down = value < -0.05;
  const Icon = up ? ArrowUpRightIcon : down ? ArrowDownRightIcon : MinusIcon;
  return (
    <p className="flex items-center gap-1 text-caption tabular-nums text-foreground">
      <Icon
        aria-hidden="true"
        className={cn("size-4", up ? "text-primary" : down ? "text-destructive" : "text-muted-foreground")}
      />
      <span className="sr-only">{up ? "Up" : down ? "Down" : "No change"}</span>
      {formatDelta(value)}
      <span className="text-muted-foreground">vs yesterday</span>
    </p>
  );
}

export function KpiCard({
  label,
  value,
  delta,
  attention,
  note,
}: {
  label: string;
  value: string;
  delta?: number | null;
  attention?: boolean;
  note?: string;
}) {
  return (
    <Card className={cn(CARD, attention && "border-destructive bg-destructive/5")}>
      <p className="flex h-5 items-center gap-2 text-sm text-muted-foreground">
        {attention && <TriangleAlertIcon aria-hidden="true" className="size-4 text-destructive" />}
        {label}
      </p>
      <p className="h-9 text-display-md leading-9 tabular-nums text-foreground">{value}</p>
      <div className="h-5">{note ? <p className="text-caption text-muted-foreground">{note}</p> : <Delta value={delta ?? null} />}</div>
    </Card>
  );
}

export function KpiRow({ query }: { query: Query<DashboardKpis> }) {
  if (query.status === "loading") {
    return (
      <div className={GRID} role="status" aria-label="Loading key figures">
        {[0, 1, 2, 3].map((i) => (
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
  return (
    <ul className={GRID} aria-label="Key figures">
      <li className="contents">
        <KpiCard label="Entries today" value={formatNumber(k.entriesToday)} delta={k.deltas.entries} />
      </li>
      <li className="contents">
        <KpiCard label="Exits today" value={formatNumber(k.exitsToday)} delta={k.deltas.exits} />
      </li>
      <li className="contents">
        <KpiCard label="Currently inside" value={formatNumber(k.inside)} delta={k.deltas.inside} />
      </li>
      <li className="contents">
        <KpiCard
          label="Average dwell today"
          value={k.avgDwellMs === null ? "—" : formatDuration(k.avgDwellMs)}
          delta={k.deltas.dwell}
        />
      </li>
      {k.exceptions > 0 && (
        <li className="contents">
          <KpiCard
            attention
            label="Exceptions"
            value={formatNumber(k.exceptions)}
            note="Need a supervisor's eye"
          />
        </li>
      )}
    </ul>
  );
}
