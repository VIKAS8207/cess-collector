"use client";

import { useRef, useState } from "react";
import { CircleCheckIcon, EyeIcon, QrCodeIcon, TruckIcon } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockEmpty, BlockError } from "@/components/dashboard/block-states";
import { PageHeader } from "@/components/gate/page-header";
import { StatusPill } from "@/components/gate/status-pill";
import { QrDialog } from "@/components/gate/qr-dialog";
import { useToast } from "@/components/gate/toast";
import { EntryDetailsDialog } from "@/components/gate-entry/entry-details-dialog";
import { EntryForm } from "@/components/gate-entry/entry-form";
import { useAuth } from "@/lib/auth-store";
import { forcedErrors, getTodayEntries } from "@/lib/api/gate";
import { useLiveQuery } from "@/hooks/use-live-query";
import { useHotkey } from "@/hooks/use-hotkey";
import type { Movement } from "@/lib/domain/types";
import { formatTime } from "@/lib/format";

type View = "form" | "table";

const BODY = "h-[560px]";
const columns: Column<Movement>[] = [
  { key: "time", header: "Time", cell: (m) => <span className="tabular-nums text-muted-foreground">{formatTime(m.entryAt!)}</span> },
  { key: "no", header: "Entry no", cell: (m) => <span className="tabular-nums text-muted-foreground">{m.entryNo}</span> },
  { key: "plate", header: "Plate", primary: true, cell: (m) => m.plate || "No plate" },
  { key: "driver", header: "Driver", cell: (m) => m.driverName },
  { key: "purpose", header: "Purpose", cell: (m) => m.purpose },
  { key: "status", header: "Status", cell: (m) => <StatusPill movement={m} /> },
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
                <DataTable
                  id="ge"
                  caption="Today's entries"
                  columns={columns}
                  rows={entries.data}
                  rowKey={(m) => m.id}
                  highlightId={highlight}
                  pageSize={10}
                  actionLabel={(m) => `Actions for ${m.entryNo}`}
                  actions={(m) => [
                    { label: "View", icon: EyeIcon, onSelect: () => setOpenId(m.id) },
                    { label: "QR code", icon: QrCodeIcon, onSelect: () => setQrId(m.id) },
                  ]}
                />
              )}
            </div>
          </Card>
        </div>
      )}

      <EntryDetailsDialog
        id={openId}
        onClose={() => setOpenId(null)}
        onShowQr={(id) => {
          setOpenId(null);
          setQrId(id);
        }}
      />
      <QrDialog id={qrId} onClose={() => setQrId(null)} />
    </div>
  );
}
