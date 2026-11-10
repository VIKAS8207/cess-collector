"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PackageIcon, PlusIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockEmpty, BlockError } from "@/components/dashboard/block-states";
import { CARD, GRID, KpiCard } from "@/components/dashboard/kpi-row";
import { PageHeader } from "@/components/gate/page-header";
import { useSupplier } from "@/components/supplier/use-supplier";
import { getDispatches, summarize } from "@/lib/api/dispatch";
import { gateStateLabel, hasArrived } from "@/lib/domain/dispatch-store";
import { formatDate, formatInr, formatNumber, formatStamp } from "@/lib/format";
import { useLiveQuery } from "@/hooks/use-live-query";
import { useNow } from "@/hooks/use-now";

const BODY = "h-[320px]";

/** The supplier's home: how many trucks they sent, where they are, and what they cost. */
export function SupplierDashboard() {
  const { user, supplier, demo } = useSupplier();
  const router = useRouter();
  const now = useNow(60_000);
  const list = useLiveQuery(`sd-list:${supplier?.id ?? ""}`, () => (supplier ? getDispatches(supplier, "") : Promise.resolve([])));
  const rows = list.status === "ready" ? list.data : [];
  const s = summarize(rows);
  const onTheWay = rows.filter((r) => r.gate.state === "expected");
  const reached = rows
    .filter((r) => hasArrived(r.gate.state))
    .sort((a, b) => (b.gate.entryAt ?? 0) - (a.gate.entryAt ?? 0));
  const first = user?.name.split(" ")[0] ?? "";
  const who = demo && supplier ? supplier.name : user?.name;

  return (
    <div className="flex flex-col gap-8 lg:gap-10">
      <PageHeader
        title={first ? `Hello, ${first}` : "Dashboard"}
        description={now ? `${formatDate(now)} · ${who}` : undefined}
        actions={
          <Link href="/dispatches" className={buttonVariants()}>
            <PlusIcon aria-hidden="true" />
            Register a truck
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
          <KpiCard label="Trucks sent" value={formatNumber(s.total)} note={s.quantity.map((q) => `${formatNumber(q.qty)} ${q.unit}`).join(" · ") || "Nothing sent yet"} />
          <KpiCard label="On the way" value={formatNumber(s.onTheWay)} note="Not scanned at the gate yet" />
          <KpiCard label="Reached the gate" value={formatNumber(s.reached)} note={`${formatInr(s.valueReached)} of goods`} />
          <KpiCard label="Total cost sent" value={formatInr(s.value)} note={s.notReached ? `${s.notReached} marked not reached` : "All trucks counted"} />
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <Card className="gap-4">
          <CardHeader>
            <CardTitle className="text-heading-md">On the way</CardTitle>
            <CardDescription>Trucks waiting to be scanned at the gate</CardDescription>
          </CardHeader>
          <div className="px-(--card-spacing)">
            {list.status === "loading" && <Skeleton className={BODY} role="status" aria-label="Loading trucks" />}
            {list.status === "error" && <BlockError onRetry={list.retry} className={BODY} />}
            {list.status === "ready" && onTheWay.length === 0 && (
              <BlockEmpty icon={PackageIcon} text="No truck is on the way." actionLabel="Register a truck" onAction={() => router.push("/dispatches")} className={BODY} />
            )}
            {list.status === "ready" && onTheWay.length > 0 && (
              <ul className={`${BODY} overflow-auto`}>
                {onTheWay.map((r) => (
                  <li key={r.id} className="flex min-h-14 items-center justify-between gap-3 border-b border-border py-2 last:border-b-0">
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[15px] text-foreground">{r.plate} · {r.commodity}</span>
                      <span className="text-caption text-muted-foreground">
                        {r.driverName} · {formatStamp(r.createdAt)}
                      </span>
                    </span>
                    <span className="text-[15px] tabular-nums text-foreground">
                      {formatNumber(r.quantity)} {r.unit}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card className="gap-4">
          <CardHeader>
            <CardTitle className="text-heading-md">Reached the gate</CardTitle>
            <CardDescription>Latest scans, newest first</CardDescription>
          </CardHeader>
          <div className="px-(--card-spacing)">
            {list.status === "loading" && <Skeleton className={BODY} role="status" aria-label="Loading scans" />}
            {list.status === "error" && <BlockError onRetry={list.retry} className={BODY} />}
            {list.status === "ready" && reached.length === 0 && (
              <BlockEmpty icon={PackageIcon} text="No truck has been scanned yet." actionLabel="See all dispatches" onAction={() => router.push("/dispatches")} className={BODY} />
            )}
            {list.status === "ready" && reached.length > 0 && (
              <ul className={`${BODY} overflow-auto`}>
                {reached.slice(0, 12).map((r) => (
                  <li key={r.id} className="flex min-h-14 items-center justify-between gap-3 border-b border-border py-2 last:border-b-0">
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[15px] text-foreground">{r.plate} · {r.commodity}</span>
                      <span className="text-caption text-muted-foreground">
                        {r.gate.entryNo} · {r.gate.entryAt ? formatStamp(r.gate.entryAt) : ""}
                      </span>
                    </span>
                    <Pill tone="brand">{gateStateLabel[r.gate.state]}</Pill>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {list.status === "ready" && rows.length > 0 && (
            <div className="px-(--card-spacing)">
              <Link href="/dispatches" className="text-sm text-primary hover:underline">
                View all dispatches
              </Link>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
