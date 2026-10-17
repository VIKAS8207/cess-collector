"use client";

import { useRef, useState } from "react";
import { CircleCheckIcon, QrCodeIcon, TruckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockEmpty, BlockError } from "@/components/dashboard/block-states";
import { PageHeader } from "@/components/gate/page-header";
import { StatusPill } from "@/components/gate/status-pill";
import { MovementDrawer } from "@/components/gate/movement-drawer";
import { QrDialog } from "@/components/gate/qr-dialog";
import { useToast } from "@/components/gate/toast";
import { EntryForm } from "@/components/gate-entry/entry-form";
import { useAuth } from "@/lib/auth-store";
import { forcedErrors, getTodayEntries } from "@/lib/api/gate";
import { useLiveQuery } from "@/hooks/use-live-query";
import { useHotkey } from "@/hooks/use-hotkey";
import type { Movement } from "@/lib/domain/types";
import { formatTime } from "@/lib/format";
import { cn } from "cn";

type View = "form" | "table";

const BODY = "h-[560px]";

const columns = [
  "Time",
  "Entry no",
  "Plate",
  "FASTag",
  "Driver",
  "Phone",
  "Vehicle type",
  "Transporter",
  "Purpose",
  "Reference",
  "Operator",
  "Gate",
  "Status",
  "QR code",
];

export function EntryPage() {
  const { user } = useAuth();
  const toast = useToast();
  const operator = user?.name ?? "Operator";
  const [view, setView] = useState<View>("form");
  const [saved, setSaved] = useState<Movement | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [qrId, setQrId] = useState<string | null>(null);
  const formWrap = useRef<HTMLDivElement>(null);

  const entries = useLiveQuery("today-entries", (attempt) =>
    getTodayEntries({ forceError: attempt === 0 && forcedErrors().has("entries") })
  );

  const showForm = () => {
    setSaved(null);
    setView("form");
    // The form stays mounted while hidden so a half-typed entry is not lost.
    setTimeout(() => document.getElementById("ge-plate")?.focus(), 60);
  };
  useHotkey("n", showForm);

  const onSaved = (m: Movement) => {
    setSaved(m);
    setHighlight(m.id);
    setTimeout(() => setHighlight((h) => (h === m.id ? null : h)), 3000);
    toast.push(`Entry ${m.entryNo} saved for ${m.plate || m.fastag}.`);
    setView("table");
    setQrId(m.id);
  };

  const count = entries.status === "ready" ? entries.data.length : null;

  return (
    <div className="flex flex-col gap-8 lg:gap-10">
      <PageHeader
        title="Gate Entry"
        description="Record a truck as it arrives. Scanner input works in every field."
        actions={
          <Segmented
            label="Gate entry view"
            value={view}
            onChange={(v) => (v === "form" ? showForm() : setView("table"))}
            options={[
              { value: "form", label: "Entry form" },
              { value: "table", label: count === null ? "Today's entries" : `Today's entries (${count})` },
            ]}
          />
        }
      />

      <div
        ref={formWrap}
        hidden={view !== "form"}
        className="mx-auto w-full max-w-220 animate-in fade-in slide-in-from-bottom-2 duration-300"
      >
        <EntryForm operator={operator} onSaved={onSaved} />
      </div>

      {view === "table" && (
        <div className="flex animate-in flex-col gap-4 fade-in slide-in-from-bottom-2 duration-300">
          {saved && (
            <div
              role="status"
              className="flex items-start gap-3 rounded-card border border-border bg-background p-4 text-sm shadow-card"
            >
              <CircleCheckIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
              <p className="text-foreground">
                Entry <span className="tabular-nums">{saved.entryNo}</span> saved for {saved.plate || saved.fastag} at{" "}
                {formatTime(saved.entryAt!)}.
              </p>
            </div>
          )}

          <Card className="gap-4">
            <CardHeader>
              <CardTitle className="text-heading-md">Today&apos;s entries</CardTitle>
              <CardDescription>
                {entries.status === "ready" ? `${entries.data.length} so far, newest first` : "Newest first"}
              </CardDescription>
            </CardHeader>
            <div className="px-(--card-spacing)">
              {entries.status === "loading" && (
                <div className={BODY} role="status" aria-label="Loading today's entries">
                  <div className="flex h-10 items-center">
                    <Skeleton className="h-4 w-24" />
                  </div>
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex h-14 items-center gap-4">
                      <Skeleton className="h-4 w-14" />
                      <Skeleton className="h-4 flex-1" />
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                  ))}
                </div>
              )}
              {entries.status === "error" && <BlockError onRetry={entries.retry} className={BODY} />}
              {entries.status === "ready" && entries.data.length === 0 && (
                <BlockEmpty
                  icon={TruckIcon}
                  text="No entries yet today."
                  actionLabel="Open the entry form"
                  onAction={showForm}
                  className={BODY}
                />
              )}
              {entries.status === "ready" && entries.data.length > 0 && (
                <div className={cn(BODY, "overflow-auto")}>
                  <table className="w-full min-w-[1300px] text-[15px]">
                    <caption className="sr-only">Today&apos;s entries with full details</caption>
                    <thead>
                      <tr className="h-10 border-b border-border text-left text-caption text-muted-foreground">
                        {columns.map((c) => (
                          <th key={c} scope="col" className="pr-4 font-normal whitespace-nowrap">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {entries.data.map((m) => (
                        <tr
                          key={m.id}
                          onClick={() => setOpenId(m.id)}
                          className={cn(
                            "h-14 cursor-pointer border-b border-border transition-colors duration-700 last:border-b-0 hover:bg-muted",
                            highlight === m.id && "bg-tag/40"
                          )}
                        >
                          <td className="pr-4 whitespace-nowrap tabular-nums text-muted-foreground">
                            {formatTime(m.entryAt!)}
                          </td>
                          <td className="pr-4 whitespace-nowrap tabular-nums text-muted-foreground">{m.entryNo}</td>
                          <th scope="row" className="pr-4 text-left font-normal whitespace-nowrap">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenId(m.id);
                              }}
                              className="rounded-field text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                            >
                              {m.plate || "No plate"}
                            </button>
                          </th>
                          <td className="pr-4 text-caption whitespace-nowrap tabular-nums text-muted-foreground">
                            {m.fastag || "—"}
                          </td>
                          <td className="pr-4 whitespace-nowrap">{m.driverName}</td>
                          <td className="pr-4 whitespace-nowrap tabular-nums">{m.driverPhone || "—"}</td>
                          <td className="pr-4 whitespace-nowrap">{m.vehicleType}</td>
                          <td className="pr-4 whitespace-nowrap">{m.transporter || "—"}</td>
                          <td className="pr-4 whitespace-nowrap">{m.purpose}</td>
                          <td className="pr-4 whitespace-nowrap">{m.reference || "—"}</td>
                          <td className="pr-4 whitespace-nowrap">{m.operator}</td>
                          <td className="pr-4 whitespace-nowrap">{m.gate}</td>
                          <td className="pr-4">
                            <StatusPill movement={m} />
                          </td>
                          <td>
                            <Button
                              variant="outline"
                              size="sm"
                              aria-label={`Show QR code for ${m.entryNo}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setQrId(m.id);
                              }}
                            >
                              <QrCodeIcon aria-hidden="true" />
                              QR
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      <MovementDrawer id={openId} onClose={() => setOpenId(null)} />
      <QrDialog id={qrId} onClose={() => setQrId(null)} />
    </div>
  );
}
