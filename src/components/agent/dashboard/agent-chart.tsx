"use client";

import { useState } from "react";
import { ChartColumnIcon } from "lucide-react";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockEmpty, BlockError } from "@/components/dashboard/block-states";
import { BarChart, Legend } from "@/components/gate/bar-chart";
import type { Query } from "@/hooks/use-live-query";
import { dominantUnit, type AgentSeries } from "@/lib/api/agent";
import { units, type Unit } from "@/lib/domain/agent-types";
import { formatQty } from "@/lib/format";

const BODY = "h-[360px]";

export function AgentChart({
  query,
  rangeLabel,
  onReset,
}: {
  query: Query<AgentSeries>;
  rangeLabel: string;
  onReset: () => void;
}) {
  const [picked, setPicked] = useState<Unit | null>(null);
  const present =
    query.status === "ready" ? units.filter((u) => query.data.byUnit[u]) : [];
  const main =
    query.status === "ready"
      ? (picked && present.includes(picked) ? picked : dominantUnit(
          Object.fromEntries(
            present.map((u) => [u, query.data.byUnit[u]!.received.reduce((a, b) => a + b, 0)])
          ) as Partial<Record<Unit, number>>
        ) ?? present[0] ?? null)
      : null;
  const series = query.status === "ready" && main ? query.data.byUnit[main] : undefined;

  const summary = series
    ? `${formatQty(series.received.reduce((a, b) => a + b, 0))} ${main} received and ${formatQty(
        series.sold.reduce((a, b) => a + b, 0)
      )} ${main} sold in this period.`
    : "";

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-heading-md">Received and sold</CardTitle>
        <CardDescription>
          {rangeLabel}
          {query.status === "ready" ? ` · ${query.data.period}` : ""}
          {main ? ` · in ${main}` : ""}
        </CardDescription>
        <CardAction className="max-sm:hidden">
          <Legend
            items={[
              { label: "Received", className: "bg-primary" },
              { label: "Sold", className: "bg-tag" },
            ]}
          />
        </CardAction>
      </CardHeader>
      <div className="px-(--card-spacing)">
        {query.status === "loading" && (
          <div className={BODY} role="status" aria-label="Loading chart">
            <Skeleton className="h-10 w-72" />
            <Skeleton className="mt-4 h-[280px] w-full" />
          </div>
        )}
        {query.status === "error" && <BlockError onRetry={query.retry} className={BODY} />}
        {query.status === "ready" && !series && (
          <BlockEmpty
            icon={ChartColumnIcon}
            text="No goods received or sold in this period."
            actionLabel="Show today"
            onAction={onReset}
            className={BODY}
          />
        )}
        {query.status === "ready" && series && main && (
          <div className={BODY}>
            {present.length > 1 ? (
              <Segmented
                label="Unit"
                value={main}
                onChange={setPicked}
                options={present.map((u) => ({ value: u, label: u }))}
                className="mb-4 max-w-full overflow-x-auto"
              />
            ) : (
              <div className="mb-4 h-10" />
            )}
            <BarChart
              labels={query.data.labels}
              height={270}
              labelEvery={query.data.labels.length > 24 ? 5 : query.data.labels.length > 12 ? 3 : 1}
              format={(n) => formatQty(n)}
              summary={summary}
              series={[
                { name: "Received", values: series.received, className: "fill-primary" },
                { name: "Sold", values: series.sold, className: "fill-tag" },
              ]}
            />
            <p className="sr-only">{summary}</p>
          </div>
        )}
      </div>
    </Card>
  );
}
