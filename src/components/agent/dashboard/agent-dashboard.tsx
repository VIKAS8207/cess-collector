"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarIcon, PlusIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { PageHeader } from "@/components/gate/page-header";
import { ReceiptDrawer } from "@/components/agent/receipt-drawer";
import { AgentKpiRow } from "@/components/agent/dashboard/agent-kpis";
import { AgentChart } from "@/components/agent/dashboard/agent-chart";
import { AgentAttentionCard, AgentRecentCard, WaitingCard } from "@/components/agent/dashboard/agent-lists";
import { useLiveQuery } from "@/hooks/use-live-query";
import { useNow } from "@/hooks/use-now";
import { useAuth } from "@/lib/auth-store";
import {
  getAgentAttention,
  getAgentKpis,
  getAgentRecent,
  getAgentSeries,
  getWaiting,
} from "@/lib/api/agent";
import { forcedErrors } from "@/lib/api/gate";
import { rangePresets, resolveRange, type RangePreset } from "@/lib/domain/range";
import { activeGate } from "@/lib/domain/settings";
import { getSale } from "@/lib/domain/agent-store";
import { formatDate } from "@/lib/format";

const shiftOf = (now: number) => {
  const h = new Date(now).getHours();
  return h >= 6 && h < 14 ? "Morning" : h >= 14 && h < 22 ? "Evening" : "Night";
};
const greeting = (now: number) => {
  const h = new Date(now).getHours();
  return h >= 5 && h < 12 ? "Good morning" : h >= 12 && h < 17 ? "Good afternoon" : "Good evening";
};

export function AgentDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const now = useNow(60_000);
  const [preset, setPreset] = useState<RangePreset>("7d");
  const [openId, setOpenId] = useState<string | null>(null);
  const label = rangePresets.find((r) => r.id === preset)?.label ?? "";

  const opts = (name: string, attempt: number) => ({ forceError: attempt === 0 && forcedErrors().has(name) });

  const kpis = useLiveQuery("a-kpis", (a) => getAgentKpis(opts("kpis", a)));
  const series = useLiveQuery(`a-series:${preset}`, (a) => getAgentSeries(resolveRange(preset, Date.now()), opts("chart", a)));
  const waiting = useLiveQuery("a-waiting", (a) => getWaiting(opts("waiting", a)));
  const attention = useLiveQuery("a-attention", (a) => getAgentAttention(opts("attention", a)));
  const recent = useLiveQuery("a-recent", (a) => getAgentRecent(opts("recent", a)));

  return (
    <div className="flex flex-col gap-8 lg:gap-10">
      <PageHeader
        title={now ? `${greeting(now)}, ${user?.name.split(" ")[0] ?? ""}` : "Dashboard"}
        description={now ? `${formatDate(now)} · ${shiftOf(now)} shift · ${activeGate()} · ${user?.name}` : undefined}
        actions={
          <>
            <SelectField
              id="a-range"
              label="Date range"
              hideLabel
              icon={<CalendarIcon aria-hidden="true" />}
              value={preset}
              onChange={(v) => setPreset(v as RangePreset)}
              options={rangePresets.map((r) => ({ value: r.id, label: r.label }))}
            />
            <Link href="/receive-goods?new=1" className={buttonVariants()}>
              <PlusIcon aria-hidden="true" />
              Receive goods
            </Link>
          </>
        }
      />

      <AgentKpiRow query={kpis} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <AgentChart query={series} rangeLabel={label} onReset={() => setPreset("30d")} />
        </div>
        <AgentAttentionCard query={attention} onOpenReceipt={setOpenId} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <WaitingCard query={waiting} onOpen={setOpenId} />
        </div>
        <AgentRecentCard
          query={recent}
          onOpen={(e) => {
            if (e.receiptId) setOpenId(e.receiptId);
            else if (e.partyId) router.push(`/settlements?party=${e.partyId}`);
            else if (e.saleId && getSale(e.saleId)) router.push(`/sales?q=${getSale(e.saleId)!.no}`);
          }}
        />
      </div>

      <ReceiptDrawer id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
