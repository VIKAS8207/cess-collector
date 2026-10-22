"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ScaleIcon, TruckIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockEmpty, BlockError } from "@/components/dashboard/block-states";
import { CARD, GRID, KpiCard } from "@/components/dashboard/kpi-row";
import { PageHeader } from "@/components/gate/page-header";
import { MovementDrawer } from "@/components/gate/movement-drawer";
import { useAuth } from "@/lib/auth-store";
import { forcedErrors, getInside, getWeighments } from "@/lib/api/gate";
import { startOfDay } from "@/lib/domain/seed";
import { nextStage, stageLabel, weighSummary } from "@/lib/domain/types";
import { formatDate, formatStamp } from "@/lib/format";
import { useLiveQuery } from "@/hooks/use-live-query";
import { useNow } from "@/hooks/use-now";

const BODY = "h-[320px]";
const kgFmt = new Intl.NumberFormat("en-IN");

export function WeighDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const now = useNow(60_000);
  const [openId, setOpenId] = useState<string | null>(null);
  const inside = useLiveQuery("wd-inside", (a) => getInside({ forceError: a === 0 && forcedErrors().has("inside") }));
  const weighed = useLiveQuery("wd-weighed", (a) => getWeighments({ forceError: a === 0 && forcedErrors().has("weighments") }));

  const pending =
    inside.status === "ready" ? inside.data.filter((m) => nextStage(m) !== null).sort((a, b) => a.entryAt! - b.entryAt!) : [];
  const waitingGross = pending.filter((m) => nextStage(m) === "gross").length;
  const waitingTare = pending.length - waitingGross;
  const list = weighed.status === "ready" ? weighed.data : [];
  const dayStart = now ? startOfDay(now) : 0;
  const passesToday = list.reduce((n, m) => n + (m.weighments ?? []).filter((w) => w.at >= dayStart).length, 0);
  const netToday = list.reduce((sum, m) => {
    const w = weighSummary(m);
    return w.tare && w.tare.at >= dayStart && w.net ? sum + w.net : sum;
  }, 0);
  const first = user?.name.split(" ")[0] ?? "";
  const ready = inside.status === "ready" && weighed.status === "ready";
  const failed = inside.status === "error" || weighed.status === "error";
  const retry = () => {
    if (inside.status === "error") inside.retry();
    if (weighed.status === "error") weighed.retry();
  };

  return (
    <div className="flex flex-col gap-8 lg:gap-10">
      <PageHeader
        title={first ? `Hello, ${first}` : "Dashboard"}
        description={now ? `${formatDate(now)} · ${user?.name}` : undefined}
        actions={
          <Link href="/weight-bridge" className={buttonVariants()}>
            <ScaleIcon aria-hidden="true" />
            Open weight bridge
          </Link>
        }
      />

      {failed ? (
        <Card className="h-[132px] justify-center">
          <BlockError onRetry={retry} />
        </Card>
      ) : !ready ? (
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
          <KpiCard label="Weighings today" value={String(passesToday)} note="Gross and tare passes" />
          <KpiCard label="Waiting for gross" value={String(waitingGross)} note="Inside, not weighed yet" attention={waitingGross > 5} />
          <KpiCard label="Waiting for tare" value={String(waitingTare)} note="Gross done, goods not yet out" />
          <KpiCard label="Net goods today" value={`${kgFmt.format(netToday)} kg`} note="Trucks with both weighings" />
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <Card className="gap-4">
          <CardHeader>
            <CardTitle className="text-heading-md">Waiting for the bridge</CardTitle>
            <CardDescription>Trucks inside that still need a gross or tare weighing, oldest first</CardDescription>
          </CardHeader>
          <div className="px-(--card-spacing)">
            {inside.status === "loading" && <Skeleton className={BODY} role="status" aria-label="Loading trucks" />}
            {inside.status === "error" && <BlockError onRetry={inside.retry} className={BODY} />}
            {inside.status === "ready" && pending.length === 0 && (
              <BlockEmpty icon={TruckIcon} text="Every truck inside has been weighed." actionLabel="Open weight bridge" onAction={() => router.push("/weight-bridge")} className={BODY} />
            )}
            {inside.status === "ready" && pending.length > 0 && (
              <ul className={`${BODY} overflow-auto`}>
                {pending.map((m) => (
                  <li key={m.id} className="flex h-14 items-center justify-between gap-3 border-b border-border last:border-b-0">
                    <button
                      type="button"
                      onClick={() => setOpenId(m.id)}
                      className="flex flex-col rounded-field text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <span className="text-[15px] text-foreground">{m.plate || m.fastag}</span>
                      <span className="text-caption text-muted-foreground">
                        {nextStage(m) === "gross" ? "Needs gross" : "Needs tare"} · in {formatStamp(m.entryAt!)}
                      </span>
                    </button>
                    <Link
                      href={`/weight-bridge?q=${encodeURIComponent(m.entryNo)}`}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      Weigh
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card className="gap-4">
          <CardHeader>
            <CardTitle className="text-heading-md">Recent weighments</CardTitle>
            <CardDescription>Latest first</CardDescription>
          </CardHeader>
          <div className="px-(--card-spacing)">
            {weighed.status === "loading" && <Skeleton className={BODY} role="status" aria-label="Loading weighments" />}
            {weighed.status === "error" && <BlockError onRetry={weighed.retry} className={BODY} />}
            {weighed.status === "ready" && list.length === 0 && <BlockEmpty icon={ScaleIcon} text="No trucks weighed yet." actionLabel="Open weight bridge" onAction={() => router.push("/weight-bridge")} className={BODY} />}
            {weighed.status === "ready" && list.length > 0 && (
              <ul className={`${BODY} overflow-auto`}>
                {list.slice(0, 12).map((m) => {
                  const w = m.weighments![0];
                  return (
                    <li key={m.id} className="flex h-14 items-center justify-between gap-3 border-b border-border last:border-b-0">
                      <button
                        type="button"
                        onClick={() => setOpenId(m.id)}
                        className="flex flex-col rounded-field text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <span className="text-[15px] text-foreground">{m.plate || m.fastag}</span>
                        <span className="text-caption text-muted-foreground">
                          {w.product} · {formatStamp(w.at)}
                        </span>
                      </button>
                      <span className="flex items-center gap-3">
                        <span className="tabular-nums text-foreground">{kgFmt.format(w.kg)} kg</span>
                        <Pill tone={w.stage === "gross" ? "brand" : "neutral"}>{stageLabel[w.stage]}</Pill>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Card>
      </div>

      <MovementDrawer id={openId} onClose={() => setOpenId(null)} exitAction={() => undefined} />
    </div>
  );
}
