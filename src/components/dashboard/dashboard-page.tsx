"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarIcon, PlusIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { PageHeader } from "@/components/gate/page-header";
import { MovementDrawer } from "@/components/gate/movement-drawer";
import { KpiRow } from "@/components/dashboard/kpi-row";
import { ChartCard } from "@/components/dashboard/chart-card";
import { AttentionCard } from "@/components/dashboard/attention-card";
import { InsideCard } from "@/components/dashboard/inside-card";
import { RecentCard } from "@/components/dashboard/recent-card";
import { useLiveQuery } from "@/hooks/use-live-query";
import { useNow } from "@/hooks/use-now";
import { useAuth } from "@/lib/auth-store";
import {
  forcedErrors,
  getAttention,
  getInside,
  getKpis,
  getRecent,
  getSeries,
} from "@/lib/api/gate";
import { resolveRange, rangePresets, type RangePreset } from "@/lib/domain/range";
import { activeGate } from "@/lib/domain/settings";
import { formatDate } from "@/lib/format";

function shiftOf(now: number) {
  const h = new Date(now).getHours();
  return h >= 6 && h < 14 ? "Morning" : h >= 14 && h < 22 ? "Evening" : "Night";
}

function greeting(now: number) {
  const h = new Date(now).getHours();
  return h >= 5 && h < 12 ? "Good morning" : h >= 12 && h < 17 ? "Good afternoon" : "Good evening";
}

export function DashboardPage() {
  const { user } = useAuth();
  const now = useNow(60_000);
  const [preset, setPreset] = useState<RangePreset>("today");
  const [openId, setOpenId] = useState<string | null>(null);
  const label = rangePresets.find((r) => r.id === preset)?.label ?? "";

  // Only the first attempt can be forced to fail, so "Try again" recovers.
  const opts = (name: string, attempt: number) => ({
    forceError: attempt === 0 && forcedErrors().has(name),
  });

  const kpis = useLiveQuery("kpis", (a) => getKpis(opts("kpis", a)));
  const series = useLiveQuery(`series:${preset}`, (a) =>
    getSeries(resolveRange(preset, Date.now()), opts("chart", a))
  );
  const attention = useLiveQuery("attention", (a) => getAttention(opts("attention", a)));
  const inside = useLiveQuery("inside", (a) => getInside(opts("inside", a)));
  const recent = useLiveQuery("recent", (a) => getRecent(opts("recent", a)));

  const first = user?.name.split(" ")[0] ?? "";

  return (
    <div className="flex flex-col gap-8 lg:gap-10">
      <PageHeader
        title={now ? `${greeting(now)}, ${first}` : "Dashboard"}
        description={
          now
            ? `${formatDate(now)} · ${shiftOf(now)} shift · ${activeGate()} · ${user?.name}`
            : undefined
        }
        actions={
          <>
            <SelectField
              id="range"
              label="Date range"
              hideLabel
              icon={<CalendarIcon aria-hidden="true" />}
              value={preset}
              onChange={(v) => setPreset(v as RangePreset)}
              options={rangePresets.map((r) => ({ value: r.id, label: r.label }))}
            />
            <Link href="/gate-entry?new=1" className={buttonVariants()}>
              <PlusIcon aria-hidden="true" />
              New gate entry
            </Link>
          </>
        }
      />

      <KpiRow query={kpis} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ChartCard query={series} rangeLabel={label} onReset={() => setPreset("today")} />
        </div>
        <AttentionCard query={attention} onOpen={setOpenId} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <InsideCard query={inside} onOpen={setOpenId} />
        </div>
        <RecentCard query={recent} onOpen={setOpenId} />
      </div>

      <MovementDrawer id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
