"use client";

import { useRef, useState } from "react";
import { CircleCheckIcon, PackageIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockEmpty, BlockError } from "@/components/dashboard/block-states";
import { PageHeader } from "@/components/gate/page-header";
import { RevealPanel, useReveal } from "@/components/gate/reveal-panel";
import { useToast } from "@/components/gate/toast";
import { ReceiptDrawer } from "@/components/agent/receipt-drawer";
import { ReceiptPills } from "@/components/agent/pills";
import { VehiclePicker, matchVehicles } from "@/components/receive/vehicle-picker";
import { ReceiptForm } from "@/components/receive/receipt-form";
import { useAuth } from "@/lib/auth-store";
import { getTodayReceipts, getVehiclesForReceipt, itemsSummary, type PickerVehicle } from "@/lib/api/agent";
import { forcedErrors } from "@/lib/api/gate";
import type { Movement } from "@/lib/domain/types";
import type { Receipt } from "@/lib/domain/agent-types";
import { formatTime } from "@/lib/format";
import { useLiveQuery } from "@/hooks/use-live-query";
import { useHotkey } from "@/hooks/use-hotkey";
import { cn } from "cn";

const BODY = "h-[480px]";

export function ReceivePage() {
  const { user } = useAuth();
  const toast = useToast();
  const agent = user?.name ?? "Agent";
  const searchRef = useRef<HTMLInputElement>(null);
  const newButton = useRef<HTMLButtonElement>(null);
  const reveal = useReveal("rv-search");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<PickerVehicle | null>(null);
  const [saved, setSaved] = useState<Receipt | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const vehicles = useLiveQuery("rv-vehicles", (a) =>
    getVehiclesForReceipt({ forceError: a === 0 && forcedErrors().has("vehicles") })
  );
  const receipts = useLiveQuery("rv-receipts", (a) =>
    getTodayReceipts({ forceError: a === 0 && forcedErrors().has("receipts") })
  );

  const startNew = () => {
    setSelected(null);
    setSaved(null);
    setQ("");
    reveal.open();
  };
  const closeForm = () => {
    reveal.close();
    newButton.current?.focus();
  };
  useHotkey("/", () => (reveal.expanded ? searchRef.current?.focus() : startNew()));
  useHotkey("n", startNew);

  const pick = (v: PickerVehicle) => {
    setSelected(v);
    setSaved(null);
  };

  const onEnter = () => {
    if (vehicles.status !== "ready") return;
    const first = matchVehicles(vehicles.data, q).find((v) => !v.receipt);
    if (first) pick(first);
  };

  const onScanned = (m: Movement) => {
    if (vehicles.status !== "ready") return;
    const v = vehicles.data.find((x) => x.movement.id === m.id);
    if (!v) {
      toast.push(`${m.plate || m.fastag} is not at the gate, so it cannot be received.`);
      return;
    }
    setQ(m.plate || m.fastag);
    if (v.receipt) setOpenId(v.receipt.id);
    else pick(v);
  };

  const onSaved = (r: Receipt) => {
    setSaved(r);
    setSelected(null);
    setQ("");
    setHighlight(r.id);
    setTimeout(() => setHighlight((h) => (h === r.id ? null : h)), 3000);
    toast.push(`Receipt ${r.no} saved for ${r.plate || "the vehicle"}.`);
    closeForm();
  };

  const liveSelected =
    selected && vehicles.status === "ready"
      ? vehicles.data.find((v) => v.movement.id === selected.movement.id) ?? selected
      : selected;

  return (
    <div className="flex flex-col gap-8 lg:gap-10">
      <PageHeader
        title="Receive Goods"
        description="Pick the truck, enter what came off it, save the receipt."
        actions={
          <Button
            ref={newButton}
            onClick={startNew}
            aria-expanded={reveal.expanded}
            aria-controls="receive-form-panel"
            title="Receive new vehicle (N)"
            aria-keyshortcuts="N"
          >
            <PlusIcon aria-hidden="true" />
            Receive new vehicle
          </Button>
        }
      />

      <RevealPanel
        id="receive-form-panel"
        mounted={reveal.mounted}
        expanded={reveal.expanded}
        title="Receive new vehicle"
        onCancel={closeForm}
        wide
      >
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,5fr)]">
          <VehiclePicker
            query={vehicles}
            q={q}
            onQuery={setQ}
            onEnter={onEnter}
            searchRef={searchRef}
            selectedId={liveSelected?.movement.id ?? null}
            onSelect={pick}
            onOpenReceipt={setOpenId}
            onClear={() => setSelected(null)}
            onScanned={onScanned}
          />
          <ReceiptForm
            key={`${reveal.key}:${liveSelected?.movement.id ?? "none"}`}
            vehicle={liveSelected}
            agent={agent}
            onSaved={onSaved}
            onOpenReceipt={setOpenId}
          />
        </div>
      </RevealPanel>

      {saved && (
        <div role="status" className="flex items-start gap-3 rounded-card border border-border bg-background p-4 text-sm shadow-card">
          <CircleCheckIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
          <p className="text-foreground">
            Receipt <span className="tabular-nums">{saved.no}</span> saved for {saved.plate || "the vehicle"} at {formatTime(saved.receivedAt)}.
          </p>
        </div>
      )}

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-heading-md">Today&apos;s receipts</CardTitle>
          <CardDescription>{receipts.status === "ready" ? `${receipts.data.length} so far, newest first` : "Newest first"}</CardDescription>
        </CardHeader>
        <div className="px-(--card-spacing)">
          {receipts.status === "loading" && (
            <div className={BODY} role="status" aria-label="Loading today's receipts">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex h-14 items-center gap-4">
                  <Skeleton className="h-4 w-14" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              ))}
            </div>
          )}
          {receipts.status === "error" && <BlockError onRetry={receipts.retry} className={BODY} />}
          {receipts.status === "ready" && receipts.data.length === 0 && (
            <BlockEmpty icon={PackageIcon} text="No receipts yet today." actionLabel="Receive a vehicle" onAction={startNew} className={BODY} />
          )}
          {receipts.status === "ready" && receipts.data.length > 0 && (
            <div className={cn(BODY, "overflow-auto")}>
              <table className="w-full min-w-[360px]">
                <caption className="sr-only">Today&apos;s receipts</caption>
                <thead>
                  <tr className="h-10 border-b border-border text-left text-caption text-muted-foreground">
                    <th scope="col" className="font-normal">Time</th>
                    <th scope="col" className="font-normal">Vehicle and goods</th>
                    <th scope="col" className="font-normal">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.data.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setOpenId(r.id)}
                      className={cn(
                        "cursor-pointer border-b border-border transition-colors duration-700 last:border-b-0 hover:bg-muted",
                        highlight === r.id && "bg-tag/40"
                      )}
                    >
                      <td className="w-20 py-3 pr-3 align-top text-caption tabular-nums text-muted-foreground">{formatTime(r.receivedAt)}</td>
                      <th scope="row" className="py-3 pr-3 text-left font-normal">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenId(r.id);
                          }}
                          className="flex flex-col rounded-field text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
                          <span className="text-[15px] text-foreground">{r.plate || "No plate"}</span>
                          <span className="text-caption text-muted-foreground">{itemsSummary(r)}</span>
                        </button>
                      </th>
                      <td className="py-3 align-top">
                        <ReceiptPills receipt={r} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      <ReceiptDrawer id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
