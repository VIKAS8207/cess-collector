"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Segmented } from "@/components/ui/segmented";
import { PageHeader } from "@/components/gate/page-header";
import { SimpleMaster } from "@/components/admin/masters/simple-master";
import { BuyersTab, PartiesTab } from "@/components/admin/masters/parties-tab";
import { useAuth } from "@/lib/auth-store";
import type { MasterKind } from "@/lib/domain/admin-types";

type Tab = MasterKind | "parties" | "buyers";

const tabs: { value: Tab; label: string }[] = [
  { value: "items", label: "Items" },
  { value: "vehicleTypes", label: "Vehicle types" },
  { value: "purposes", label: "Purposes" },
  { value: "paymentModes", label: "Payment modes" },
  { value: "parties", label: "Parties" },
  { value: "buyers", label: "Buyers" },
];

export function MastersPage() {
  const { user } = useAuth();
  const params = useSearchParams();
  const admin = user?.name ?? "Admin";
  const fromUrl = tabs.find((t) => t.value === params.get("tab"))?.value;
  const [tab, setTab] = useState<Tab>(fromUrl ?? "items");
  const id = params.get("id");

  return (
    <div className="flex flex-col gap-8 lg:gap-10">
      <PageHeader title="Masters" description="Lists the other roles pick from. Nothing here is ever deleted." />
      <Segmented label="Masters" value={tab} onChange={setTab} options={tabs} className="max-w-full self-start overflow-x-auto" />
      {(tab === "items" || tab === "vehicleTypes" || tab === "purposes" || tab === "paymentModes") && (
        <SimpleMaster key={tab} kind={tab} admin={admin} />
      )}
      {tab === "parties" && <PartiesTab admin={admin} initialId={fromUrl === "parties" ? id : null} />}
      {tab === "buyers" && <BuyersTab admin={admin} initialId={fromUrl === "buyers" ? id : null} />}
    </div>
  );
}
