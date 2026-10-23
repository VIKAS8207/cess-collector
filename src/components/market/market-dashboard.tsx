"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { SearchCheckIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockEmpty, BlockError } from "@/components/dashboard/block-states";
import { CARD, GRID, KpiCard } from "@/components/dashboard/kpi-row";
import { PageHeader } from "@/components/gate/page-header";
import { useAuth } from "@/lib/auth-store";
import { getAllocations } from "@/lib/api/agent";
import { forcedErrors } from "@/lib/api/gate";
import { startOfDay } from "@/lib/domain/seed";
import { formatDate, formatQty, formatStamp } from "@/lib/format";
import { useLiveQuery } from "@/hooks/use-live-query";
import { useNow } from "@/hooks/use-now";

const BODY = "h-[320px]";

export function MarketDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const now = useNow(60_000);
  const list = useLiveQuery("md-list", (a) => getAllocations({ forceError: a === 0 && forcedErrors().has("allocations") }));
  const rows = list.status === "ready" ? list.data : [];
  const dayStart = now ? startOfDay(now) : 0;
  const today = rows.filter((a) => a.at >= dayStart);
  const trucks = new Set(today.map((a) => a.movementId)).size;
  const agents = new Set(today.map((a) => a.agent)).size;
  const traders = new Set(today.map((a) => a.partyId)).size;

  // Per agent, today: how many transactions and to how many traders.
  const byAgent = [...new Set(today.map((a) => a.agent))].map((name) => {
    const mine = today.filter((a) => a.agent === name);
    return { name, count: mine.length, traders: new Set(mine.map((a) => a.partyId)).size, trucks: new Set(mine.map((a) => a.movementId)).size };
  });
  const first = user?.name.split(" ")[0] ?? "";

  return (
    <div className="flex flex-col gap-8 lg:gap-10">
      <PageHeader
        title={first ? `Hello, ${first}` : "Dashboard"}
        description={now ? `${formatDate(now)} · ${user?.name}` : undefined}
        actions={
          <Link href="/trace" className={buttonVariants()}>
            <SearchCheckIcon aria-hidden="true" />
            Trace a truck
          </Link>
        }
      />

      {list.status === "error" ? (
        <Card className="h-[132px] justify-center">
          <BlockError onRetry={list.retry} />
        </Card>
      ) : list.status === "loading" ? (
        <div className={GRID} role="status" aria-label="Loading key figures">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i} className={CARD} aria-hidden="true">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-5 w-36" />
            </Card>
          ))}
        </div>
      ) : (
        <div className={GRID}>
          <KpiCard label="Transactions today" value={String(today.length)} note="Goods given to traders" />
          <KpiCard label="Trucks unloaded" value={String(trucks)} note="Trucks with goods given out" />
          <KpiCard label="Commission agents" value={String(agents)} note="Active today" />
          <KpiCard label="Traders served" value={String(traders)} note="Took goods today" />
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <Card className="gap-4">
          <CardHeader>
            <CardTitle className="text-heading-md">Latest transactions</CardTitle>
            <CardDescription>Agent to trader, latest first</CardDescription>
          </CardHeader>
          <div className="px-(--card-spacing)">
            {list.status === "loading" && <Skeleton className={BODY} role="status" aria-label="Loading transactions" />}
            {list.status === "error" && <BlockError onRetry={list.retry} className={BODY} />}
            {list.status === "ready" && rows.length === 0 && (
              <BlockEmpty icon={SearchCheckIcon} text="No transactions yet." actionLabel="Trace a truck" onAction={() => router.push("/trace")} className={BODY} />
            )}
            {list.status === "ready" && rows.length > 0 && (
              <ul className={`${BODY} overflow-auto`}>
                {rows.slice(0, 12).map((a) => (
                  <li key={a.id} className="flex min-h-14 items-center justify-between gap-3 border-b border-border py-2 last:border-b-0">
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[15px] text-foreground">
                        {a.agent} <span aria-hidden="true" className="text-muted-foreground">→</span> {a.partyName}
                      </span>
                      <span className="text-caption text-muted-foreground">
                        {a.plate || "Truck"} · {formatStamp(a.at)}
                      </span>
                    </span>
                    <span className="text-[15px] tabular-nums text-foreground">
                      {formatQty(a.qty)} {a.unit}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card className="gap-4">
          <CardHeader>
            <CardTitle className="text-heading-md">Commission agents today</CardTitle>
            <CardDescription>What each agent handled</CardDescription>
          </CardHeader>
          <div className="px-(--card-spacing)">
            {list.status === "loading" && <Skeleton className={BODY} role="status" aria-label="Loading agents" />}
            {list.status === "error" && <BlockError onRetry={list.retry} className={BODY} />}
            {list.status === "ready" && byAgent.length === 0 && (
              <BlockEmpty icon={SearchCheckIcon} text="No agent has handled goods today." actionLabel="Trace a truck" onAction={() => router.push("/trace")} className={BODY} />
            )}
            {list.status === "ready" && byAgent.length > 0 && (
              <ul className={`${BODY} overflow-auto`}>
                {byAgent.map((g) => (
                  <li key={g.name} className="flex min-h-14 items-center justify-between gap-3 border-b border-border py-2 last:border-b-0">
                    <span className="text-[15px] text-foreground">{g.name}</span>
                    <span className="text-caption tabular-nums text-muted-foreground">
                      {g.count} {g.count === 1 ? "transaction" : "transactions"} · {g.trucks} {g.trucks === 1 ? "truck" : "trucks"} · {g.traders}{" "}
                      {g.traders === 1 ? "trader" : "traders"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
