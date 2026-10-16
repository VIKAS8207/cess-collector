import { ChartColumnIcon } from "lucide-react";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockEmpty, BlockError } from "@/components/dashboard/block-states";
import { BarChart, Legend } from "@/components/gate/bar-chart";
import type { Query } from "@/hooks/use-live-query";
import type { Series } from "@/lib/api/gate";

const BODY = "h-[320px]";

export function summarizeSeries(s: Series): string {
  const totalIn = s.entries.reduce((a, b) => a + b, 0);
  const totalOut = s.exits.reduce((a, b) => a + b, 0);
  const peak = s.entries.indexOf(Math.max(...s.entries));
  if (totalIn === 0 && totalOut === 0) return "No entries or exits in this period.";
  return `${totalIn} entries and ${totalOut} exits in total. Entries peaked at ${s.labels[peak]} with ${s.entries[peak]}.`;
}

export function ChartCard({
  query,
  rangeLabel,
  onReset,
}: {
  query: Query<Series>;
  rangeLabel: string;
  onReset: () => void;
}) {
  const empty =
    query.status === "ready" &&
    query.data.entries.every((v) => v === 0) &&
    query.data.exits.every((v) => v === 0);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-heading-md">Entries and exits</CardTitle>
        <CardDescription>
          {rangeLabel}
          {query.status === "ready" ? ` · ${query.data.period}` : ""}
        </CardDescription>
        <CardAction className="max-sm:hidden">
          <Legend
            items={[
              { label: "Entries", className: "bg-primary" },
              { label: "Exits", className: "bg-tag" },
            ]}
          />
        </CardAction>
      </CardHeader>
      <div className="px-(--card-spacing)">
        {query.status === "loading" && (
          <div className={BODY} role="status" aria-label="Loading chart">
            <Skeleton className="h-[280px] w-full" />
            <Skeleton className="mt-2 h-4 w-full" />
          </div>
        )}
        {query.status === "error" && <BlockError onRetry={query.retry} className={BODY} />}
        {empty && (
          <BlockEmpty
            icon={ChartColumnIcon}
            text="No movements in this period."
            actionLabel="Show today"
            onAction={onReset}
            className={BODY}
          />
        )}
        {query.status === "ready" && !empty && (
          <div className={BODY}>
            <BarChart
              labels={query.data.labels}
              height={280}
              labelEvery={query.data.labels.length > 24 ? 5 : query.data.labels.length > 12 ? 3 : 1}
              summary={summarizeSeries(query.data)}
              series={[
                { name: "Entries", values: query.data.entries, className: "fill-primary" },
                { name: "Exits", values: query.data.exits, className: "fill-tag" },
              ]}
            />
            <p className="sr-only">{summarizeSeries(query.data)}</p>
          </div>
        )}
      </div>
    </Card>
  );
}
