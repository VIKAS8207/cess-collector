"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarIcon, PlusIcon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { SelectField } from "@/components/ui/select-field";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockEmpty, BlockError } from "@/components/dashboard/block-states";
import { PageHeader } from "@/components/gate/page-header";
import { useToast } from "@/components/gate/toast";
import { PartyDrawer } from "@/components/settlements/party-drawer";
import { AddPartyDrawer } from "@/components/settlements/add-party";
import { getSettlements, type PartyRow } from "@/lib/api/agent";
import { forcedErrors } from "@/lib/api/gate";
import { describeCommission } from "@/lib/domain/agent-math";
import { getParty } from "@/lib/domain/agent-store";
import { resolveRange, type RangePreset } from "@/lib/domain/range";
import type { PartyKind } from "@/lib/domain/agent-types";
import { formatInr } from "@/lib/format";
import { useAuth } from "@/lib/auth-store";
import { useLiveQuery } from "@/hooks/use-live-query";
import { cn } from "cn";

const BODY = "h-[480px]";
const rangeOptions = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

function Money({ n, dim }: { n: number; dim?: boolean }) {
  return <span className={cn("tabular-nums", dim && "text-muted-foreground")}>{formatInr(n)}</span>;
}

export function SettlementsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const params = useSearchParams();
  const agent = user?.name ?? "Agent";
  const initialParty = params.get("party");
  const [tab, setTab] = useState<PartyKind>(initialParty && getParty(initialParty)?.kind === "seller" ? "seller" : "trader");
  const [range, setRange] = useState<RangePreset>("30d");
  const [openId, setOpenId] = useState<string | null>(initialParty && getParty(initialParty) ? initialParty : null);
  const [adding, setAdding] = useState(false);

  const data = useLiveQuery(`settle:${range}`, (a) =>
    getSettlements(resolveRange(range, Date.now()), { forceError: a === 0 && forcedErrors().has("settlements") })
  );

  const rows: PartyRow[] = data.status === "ready" ? (tab === "trader" ? data.data.traders : data.data.sellers) : [];
  const isTrader = tab === "trader";

  return (
    <div className="flex flex-col gap-8 lg:gap-10">
      <PageHeader
        title="Settlements"
        description="Who owes you, and who you owe."
        actions={
          <Button onClick={() => setAdding(true)}>
            <PlusIcon aria-hidden="true" />
            Add party
          </Button>
        }
      />

      <Card className="gap-4">
        <div className="flex flex-wrap items-end justify-between gap-4 px-(--card-spacing)">
          <Segmented
            label="Party type"
            value={tab}
            onChange={setTab}
            options={[
              { value: "trader", label: "Traders" },
              { value: "seller", label: "Sellers" },
            ]}
          />
          <SelectField
            id="st-range"
            label="Date range"
            hideLabel
            icon={<CalendarIcon aria-hidden="true" />}
            value={range}
            onChange={(v) => setRange(v as RangePreset)}
            options={rangeOptions}
          />
        </div>

        <div className="px-(--card-spacing)">
          {data.status === "loading" && (
            <div className={BODY} role="status" aria-label="Loading parties">
              <div className="flex h-10 items-center">
                <Skeleton className="h-4 w-32" />
              </div>
              {Array.from({ length: 7 }, (_, i) => (
                <div key={i} className="flex h-14 items-center gap-4">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          )}
          {data.status === "error" && <BlockError onRetry={data.retry} className={BODY} />}
          {data.status === "ready" && rows.length === 0 && (
            <BlockEmpty icon={UsersIcon} text={isTrader ? "No traders yet." : "No sellers yet."} actionLabel="Add party" onAction={() => setAdding(true)} className={BODY} />
          )}
          {data.status === "ready" && rows.length > 0 && (
            <div className={cn(BODY, "@container overflow-auto")}>
              <table className="w-full min-w-[420px] text-[15px]">
                <caption className="sr-only">{isTrader ? "Traders" : "Sellers"}</caption>
                <thead>
                  <tr className="h-10 border-b border-border text-left text-caption text-muted-foreground">
                    <th scope="col" className="font-normal">Name</th>
                    <th scope="col" className="hidden font-normal @xl:table-cell">Phone</th>
                    <th scope="col" className="hidden text-right font-normal @2xl:table-cell">{isTrader ? "Sales" : "Lots"}</th>
                    <th scope="col" className="hidden text-right font-normal @lg:table-cell">{isTrader ? "Sale value" : "Goods sold"}</th>
                    <th scope="col" className="hidden text-right font-normal @3xl:table-cell">{isTrader ? "Returns credit" : "Returns"}</th>
                    <th scope="col" className="hidden text-right font-normal @2xl:table-cell">{isTrader ? "Commission" : "Commission deducted"}</th>
                    <th scope="col" className="hidden text-right font-normal @xl:table-cell">{isTrader ? "Net due" : "Net payable"}</th>
                    <th scope="col" className="hidden text-right font-normal @3xl:table-cell">Paid</th>
                    <th scope="col" className="pl-4 text-right font-normal">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.party.id} onClick={() => setOpenId(r.party.id)} className="h-14 cursor-pointer border-b border-border last:border-b-0 hover:bg-muted">
                      <th scope="row" className="py-1 pr-3 text-left font-normal">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenId(r.party.id);
                          }}
                          className="flex flex-col rounded-field text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
                          <span>{r.party.name}</span>
                          {isTrader && <span className="text-caption text-muted-foreground">{describeCommission(r.party.commission)}</span>}
                        </button>
                      </th>
                      <td className="hidden pr-3 text-caption tabular-nums text-muted-foreground @xl:table-cell">{r.party.phone}</td>
                      <td className="hidden text-right tabular-nums @2xl:table-cell">{r.count}</td>
                      <td className="hidden text-right @lg:table-cell"><Money n={r.value} /></td>
                      <td className="hidden text-right @3xl:table-cell"><Money n={r.returns} dim={!r.returns} /></td>
                      <td className="hidden text-right @2xl:table-cell"><Money n={r.commission} dim={!r.commission} /></td>
                      <td className="hidden text-right @xl:table-cell"><Money n={r.net} /></td>
                      <td className="hidden text-right @3xl:table-cell"><Money n={r.paid} dim={!r.paid} /></td>
                      <td className="pl-4 text-right">
                        <span className="flex flex-col items-end gap-1">
                          <Money n={r.balance} />
                          {r.overdue && <Pill tone="danger">Overdue</Pill>}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      <PartyDrawer id={openId} agent={agent} onClose={() => setOpenId(null)} />
      <AddPartyDrawer
        open={adding}
        defaultKind={tab}
        onClose={() => setAdding(false)}
        onAdded={(p) => {
          setAdding(false);
          setTab(p.kind);
          toast.push(`${p.name} added.`);
          setOpenId(p.id);
        }}
      />
    </div>
  );
}
