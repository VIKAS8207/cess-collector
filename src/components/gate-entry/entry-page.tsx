"use client";

import { useRef, useState } from "react";
import { CircleCheckIcon, PlusIcon, TruckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockEmpty, BlockError } from "@/components/dashboard/block-states";
import { PageHeader } from "@/components/gate/page-header";
import { StatusPill } from "@/components/gate/status-pill";
import { MovementDrawer } from "@/components/gate/movement-drawer";
import { useToast } from "@/components/gate/toast";
import { EntryForm } from "@/components/gate-entry/entry-form";
import { RevealPanel, useReveal } from "@/components/gate/reveal-panel";
import { useAuth } from "@/lib/auth-store";
import { forcedErrors, getTodayEntries } from "@/lib/api/gate";
import { useLiveQuery } from "@/hooks/use-live-query";
import { useHotkey } from "@/hooks/use-hotkey";
import type { Movement } from "@/lib/domain/types";
import { formatTime } from "@/lib/format";
import { cn } from "cn";

const BODY = "h-[520px]";

export function EntryPage() {
  const { user } = useAuth();
  const toast = useToast();
  const operator = user?.name ?? "Operator";
  const newButton = useRef<HTMLButtonElement>(null);
  const reveal = useReveal("ge-plate");
  const [saved, setSaved] = useState<Movement | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const entries = useLiveQuery("today-entries", (attempt) =>
    getTodayEntries({ forceError: attempt === 0 && forcedErrors().has("entries") })
  );

  const openForm = () => {
    setSaved(null);
    reveal.open();
  };
  const closeForm = () => {
    reveal.close();
    newButton.current?.focus();
  };
  useHotkey("n", openForm);

  const onSaved = (m: Movement) => {
    setSaved(m);
    setHighlight(m.id);
    setTimeout(() => setHighlight((h) => (h === m.id ? null : h)), 3000);
    toast.push(`Entry ${m.entryNo} saved for ${m.plate || m.fastag}.`);
    closeForm();
  };

  return (
    <div className="flex flex-col gap-8 lg:gap-10">
      <PageHeader
        title="Gate Entry"
        description="Record a truck as it arrives. Scanner input works in every field."
        actions={
          <Button
            ref={newButton}
            onClick={openForm}
            aria-expanded={reveal.expanded}
            aria-controls="entry-form-panel"
            title="New truck entry (N)"
            aria-keyshortcuts="N"
          >
            <PlusIcon aria-hidden="true" />
            New truck entry
          </Button>
        }
      />

      <RevealPanel id="entry-form-panel" mounted={reveal.mounted} expanded={reveal.expanded} title="New truck entry" onCancel={closeForm}>
        <EntryForm key={reveal.key} operator={operator} onSaved={onSaved} />
      </RevealPanel>

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
              actionLabel="New truck entry"
              onAction={openForm}
              className={BODY}
            />
          )}
          {entries.status === "ready" && entries.data.length > 0 && (
            <div className={cn(BODY, "@container overflow-auto")}>
              <table className="w-full min-w-[320px]">
                <caption className="sr-only">Today&apos;s entries</caption>
                <thead>
                  <tr className="h-10 border-b border-border text-left text-caption text-muted-foreground">
                    <th scope="col" className="font-normal">Time</th>
                    <th scope="col" className="font-normal">Plate</th>
                    <th scope="col" className="hidden font-normal @2xl:table-cell">FASTag</th>
                    <th scope="col" className="hidden font-normal @md:table-cell">Driver</th>
                    <th scope="col" className="hidden font-normal @xl:table-cell">Type</th>
                    <th scope="col" className="font-normal">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.data.map((m) => (
                    <tr
                      key={m.id}
                      onClick={() => setOpenId(m.id)}
                      className={cn(
                        "h-14 cursor-pointer border-b border-border text-[15px] transition-colors duration-700 last:border-b-0 hover:bg-muted",
                        highlight === m.id && "bg-tag/40"
                      )}
                    >
                      <td className="pr-3 tabular-nums text-muted-foreground">{formatTime(m.entryAt!)}</td>
                      <th scope="row" className="pr-3 text-left font-normal">
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
                      <td className="hidden max-w-32 truncate pr-3 text-caption tabular-nums text-muted-foreground @2xl:table-cell">
                        {m.fastag || "—"}
                      </td>
                      <td className="hidden max-w-32 truncate pr-3 @md:table-cell">{m.driverName}</td>
                      <td className="hidden pr-3 @xl:table-cell">{m.vehicleType}</td>
                      <td>
                        <StatusPill movement={m} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      <MovementDrawer id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
