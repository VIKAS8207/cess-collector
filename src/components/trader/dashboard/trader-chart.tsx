import { ChartColumnIcon } from "lucide-react";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockEmpty, BlockError } from "@/components/dashboard/block-states";
import { BarChart, Legend } from "@/components/gate/bar-chart";
import type { Query } from "@/hooks/use-live-query";
import type { TraderSeries } from "@/lib/api/trader";
import { formatCompactInr, formatInr } from "@/lib/format";

const BODY = "h-[380px]";

export function TraderChart({
  query,
  rangeLabel,
  onReset,
}: {
  query: Query<TraderSeries>;
  rangeLabel: string;
  onReset: () => void;
}) {
  const empty =
    query.status === "ready" && query.data.sold.every((v) => v === 0) && query.data.collected.every((v) => v === 0);
  const every = query.status === "ready" ? (query.data.labels.length > 24 ? 5 : query.data.labels.length > 12 ? 3 : 1) : 1;
  const summary =
    query.status === "ready"
      ? `Sold ${formatInr(query.data.sold.reduce((a, b) => a + b, 0))} and collected ${formatInr(
          query.data.collected.reduce((a, b) => a + b, 0)
        )} of saas in this period.`
      : "";

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-heading-md">Sold value and saas collected</CardTitle>
        <CardDescription>
          {rangeLabel}
          {query.status === "ready" ? ` · ${query.data.period}` : ""}
        </CardDescription>
        <CardAction className="max-sm:hidden">
          <Legend
            items={[
              { label: "Sold value", className: "bg-primary" },
              { label: "Saas collected", className: "bg-tag" },
            ]}
          />
        </CardAction>
      </CardHeader>
      <div className="px-(--card-spacing)">
        {query.status === "loading" && (
          <div className={BODY} role="status" aria-label="Loading chart">
            <Skeleton className="h-[160px] w-full" />
            <Skeleton className="mt-3 h-[150px] w-full" />
          </div>
        )}
        {query.status === "error" && <BlockError onRetry={query.retry} className={BODY} />}
        {empty && (
          <BlockEmpty icon={ChartColumnIcon} text="No sales or collections in this period." actionLabel="Show last 30 days" onAction={onReset} className={BODY} />
        )}
        {query.status === "ready" && !empty && (
          <div className={BODY}>
            <BarChart
              labels={query.data.labels}
              height={150}
              axisWidth={52}
              labelEvery={every}
              format={formatCompactInr}
              summary={summary}
              series={[{ name: "Sold value", values: query.data.sold, className: "fill-primary" }]}
            />
            <div className="mt-4">
              <BarChart
                labels={query.data.labels}
                height={110}
                axisWidth={52}
                labelEvery={every}
                format={formatCompactInr}
                summary="Saas collected per period."
                series={[{ name: "Saas collected", values: query.data.collected, className: "fill-tag" }]}
              />
            </div>
            <p className="sr-only">{summary}</p>
          </div>
        )}
      </div>
    </Card>
  );
}
