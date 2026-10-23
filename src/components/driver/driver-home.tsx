"use client";

import { useState } from "react";
import { InfoIcon, TruckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockError } from "@/components/dashboard/block-states";
import { Dwell } from "@/components/gate/dwell";
import { PageHeader } from "@/components/gate/page-header";
import { QrCode, qrPayload } from "@/components/gate/qr-code";
import { StatusPill } from "@/components/gate/status-pill";
import { useAuth } from "@/lib/auth-store";
import { demoDriverTrips, getDriverTrips, type DriverTrip } from "@/lib/api/driver";
import { forcedErrors } from "@/lib/api/gate";
import { formatDate, formatDuration, formatStamp } from "@/lib/format";
import { useLiveQuery } from "@/hooks/use-live-query";
import { useNow } from "@/hooks/use-now";

const BODY = "h-[320px]";

/** TEMPORARY: true shows dummy trips for any email. Set to false to use each driver's real trips. */
const DRIVER_DEMO = true;

const agentText = (t: DriverTrip) => (t.agents.length ? t.agents.join(", ") : t.movement.status === "Inside" ? "Not assigned yet" : "—");

const columns: Column<DriverTrip>[] = [
  { key: "entry", header: "Entered", cell: (t) => <span className="tabular-nums">{formatStamp(t.movement.entryAt!)}</span> },
  { key: "exit", header: "Exited", cell: (t) => <span className="tabular-nums">{t.movement.exitAt ? formatStamp(t.movement.exitAt) : "Still inside"}</span> },
  { key: "plate", header: "Vehicle", primary: true, cell: (t) => t.movement.plate || "No plate" },
  { key: "no", header: "Entry no", hideBelow: "lg", cell: (t) => <span className="tabular-nums text-muted-foreground">{t.movement.entryNo}</span> },
  { key: "time", header: "Time inside", hideBelow: "xl", cell: (t) => (t.movement.exitAt ? formatDuration(t.movement.exitAt - t.movement.entryAt!) : "—") },
  { key: "agent", header: "Commission agent", cell: (t) => agentText(t) },
  { key: "status", header: "Status", cell: (t) => <StatusPill movement={t.movement} /> },
];

/** The driver's own page: the active QR code and past trips. Nothing about traders, weights or money. */
export function DriverHome() {
  const { user } = useAuth();
  const now = useNow(30_000);
  const name = user?.name ?? "";
  const [demoInside, setDemoInside] = useState(true);
  const real = useLiveQuery(`driver:${name}`, (a) => getDriverTrips(name, { forceError: a === 0 && forcedErrors().has("trips") }));
  const demoNow = useNow(60_000);
  const trips = DRIVER_DEMO
    ? demoNow
      ? ({ status: "ready", data: demoDriverTrips(demoNow, demoInside) } as typeof real)
      : ({ status: "loading" } as typeof real)
    : real;
  const list = trips.status === "ready" ? trips.data : [];
  const active = list.find((t) => t.movement.status === "Inside");
  const past = list.filter((t) => t !== active);
  const first = name.split(" ")[0];

  return (
    <div className="flex flex-col gap-8 lg:gap-10">
      <PageHeader
        title={first ? `Hello, ${first}` : "My trips"}
        description={now ? `${formatDate(now)} · Show your QR code at the gate when you leave.` : undefined}
        actions={
          DRIVER_DEMO ? (
            <Button variant="outline" onClick={() => setDemoInside((v) => !v)} aria-pressed={demoInside}>
              {demoInside ? "Demo: show past trips only" : "Demo: show truck inside"}
            </Button>
          ) : undefined
        }
      />

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-heading-md">My active QR code</CardTitle>
          <CardDescription>Valid while your truck is inside the market</CardDescription>
        </CardHeader>
        <div className="px-(--card-spacing)">
          {trips.status === "loading" && <Skeleton className="h-64 w-full" role="status" aria-label="Loading your QR code" />}
          {trips.status === "error" && <BlockError onRetry={trips.retry} className="h-64" />}
          {trips.status === "ready" && !active && (
            <div role="status" className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
              <TruckIcon aria-hidden="true" className="size-8 text-muted-foreground" />
              <p className="text-body-md text-muted-foreground">Your truck is not inside the market right now, so there is no active QR code.</p>
            </div>
          )}
          {trips.status === "ready" && active && (
            <div className="flex flex-col items-center gap-8 sm:flex-row sm:items-start">
              <QrCode value={qrPayload(active.movement)} size={232} label={`Your QR code for entry ${active.movement.entryNo}`} />
              <div className="flex w-full flex-col gap-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-heading-lg break-all text-foreground">{active.movement.plate || "No plate"}</p>
                    <p className="text-caption text-muted-foreground">Entry {active.movement.entryNo}</p>
                  </div>
                  <StatusPill movement={active.movement} />
                </div>
                <dl className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-caption text-muted-foreground">Entered</dt>
                    <dd className="text-[15px] tabular-nums text-foreground">{formatStamp(active.movement.entryAt!)}</dd>
                  </div>
                  <div>
                    <dt className="text-caption text-muted-foreground">Time inside</dt>
                    <dd className="text-[15px] text-foreground">
                      <Dwell ms={now ? now - active.movement.entryAt! : null} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-caption text-muted-foreground">Commission agent</dt>
                    <dd className="text-[15px] text-foreground">{agentText(active)}</dd>
                  </div>
                </dl>
                <p className="flex items-start gap-2 text-sm text-muted-foreground">
                  <InfoIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  The gate scans this code when you leave. After that it is closed.
                </p>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-heading-md">My previous entries and exits</CardTitle>
          <CardDescription>{trips.status === "ready" ? `${past.length} earlier ${past.length === 1 ? "trip" : "trips"}, latest first` : "Latest first"}</CardDescription>
        </CardHeader>
        <div className="px-(--card-spacing)">
          {trips.status === "loading" && <Skeleton className={BODY} role="status" aria-label="Loading your trips" />}
          {trips.status === "error" && <BlockError onRetry={trips.retry} className={BODY} />}
          {trips.status === "ready" && past.length === 0 && (
            <div role="status" className="flex min-h-48 items-center justify-center text-body-md text-muted-foreground">
              No earlier trips yet.
            </div>
          )}
          {trips.status === "ready" && past.length > 0 && (
            <DataTable id="drv" caption="My previous entries and exits" columns={columns} rows={past} rowKey={(t) => t.movement.id} pageSize={10} minWidth={720} />
          )}
        </div>
      </Card>
    </div>
  );
}
