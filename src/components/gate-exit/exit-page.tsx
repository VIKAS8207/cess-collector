"use client";

import { DataTable, type Column } from "@/components/ui/data-table";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { EyeIcon, InfoIcon, LogOutIcon, QrCodeIcon, ScanLineIcon, TruckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { BlockEmpty, BlockError } from "@/components/dashboard/block-states";
import { Dwell } from "@/components/gate/dwell";
import { PageHeader } from "@/components/gate/page-header";
import { StatusPill } from "@/components/gate/status-pill";
import { MovementDrawer } from "@/components/gate/movement-drawer";
import { qrPayload } from "@/components/gate/qr-code";
import { useToast } from "@/components/gate/toast";
import { QrScanner } from "@/components/gate-exit/qr-scanner";
import { useAuth } from "@/lib/auth-store";
import { forcedErrors, getInside, lookupScan, submitExit, submitFlag, type ScanLookup } from "@/lib/api/gate";
import { allocationsFor } from "@/lib/domain/agent-store";
import { formatQty } from "@/lib/format";
import { stageLabel, weighSummary, type Movement } from "@/lib/domain/types";
import { formatDate, formatDuration, formatStamp, formatTime } from "@/lib/format";
import { useLiveQuery } from "@/hooks/use-live-query";
import { useNow } from "@/hooks/use-now";
import { useHotkey } from "@/hooks/use-hotkey";

type View = "scan" | "table";

const insideColumns = (now: number | null): Column<Movement>[] => [
  { key: "plate", header: "Vehicle", primary: true, cell: (v) => v.plate || "No plate" },
  { key: "no", header: "Entry no", cell: (v) => <span className="tabular-nums text-muted-foreground">{v.entryNo}</span> },
  { key: "driver", header: "Driver", cell: (v) => v.driverName },
  { key: "type", header: "Type", cell: (v) => v.vehicleType },
  { key: "entry", header: "Entry", cell: (v) => <span className="text-caption tabular-nums text-muted-foreground">{formatTime(v.entryAt!)}</span> },
  { key: "dwell", header: "Dwell", cell: (v) => <span className="text-caption"><Dwell ms={now ? now - v.entryAt! : null} /></span> },
  { key: "status", header: "Status", cell: (v) => <StatusPill movement={v} /> },
];

const BODY = "h-[520px]";

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="text-[15px] wrap-break-word text-foreground">{value || "—"}</dd>
    </div>
  );
}

/** What the truck did while inside: its weighings and which traders took its goods. No money is shown here. */
function TruckRecord({ movement }: { movement: Movement }) {
  const w = weighSummary(movement);
  const given = allocationsFor(movement.id);
  const photos = (movement.weighments ?? []).filter((x) => x.photo);
  return (
    <div className="flex flex-col gap-5">
      <section aria-label="Weighing" className="flex flex-col gap-3 rounded-card border border-border p-4">
        <h3 className="text-[15px] text-foreground">Weighing</h3>
        {movement.weighments?.length ? (
          <>
            <dl className="grid gap-4 sm:grid-cols-4">
              <Fact label="Product" value={w.product} />
              <Fact label="Gross" value={w.gross ? <span className="tabular-nums">{w.gross.kg.toLocaleString("en-IN")} kg</span> : "Not taken"} />
              <Fact label="Tare" value={w.tare ? <span className="tabular-nums">{w.tare.kg.toLocaleString("en-IN")} kg</span> : "Not taken"} />
              <Fact label="Net goods" value={w.net !== null ? <span className="tabular-nums">{w.net.toLocaleString("en-IN")} kg</span> : "—"} />
            </dl>
            {photos.length > 0 && (
              <div className="flex flex-wrap gap-3">
                {photos.map((x) => (
                  <figure key={x.stage} className="flex flex-col gap-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={x.photo} alt={`${stageLabel[x.stage]} weighing photo`} className="aspect-8/5 w-32 rounded-field border border-border object-cover" />
                    <figcaption className="text-caption text-muted-foreground">{stageLabel[x.stage]} photo</figcaption>
                  </figure>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">This truck was not weighed.</p>
        )}
      </section>

      <section aria-label="Goods given to traders" className="flex flex-col gap-3 rounded-card border border-border p-4">
        <h3 className="text-[15px] text-foreground">Goods given to traders</h3>
        {given.length > 0 ? (
          <>
            <dl className="grid gap-4 sm:grid-cols-3">
              <Fact label="Supplier" value={given[0].supplier} />
              <Fact label="Origin" value={given[0].origin} />
              <Fact label="Seller challan" value={given[0].challanNo} />
            </dl>
            <ul className="flex flex-col">
              {[...given].reverse().map((a) => (
                <li key={a.id} className="flex items-baseline justify-between gap-3 border-b border-border py-2 last:border-b-0">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[15px] text-foreground">{a.partyName}</span>
                    <span className="text-caption text-muted-foreground">
                      {a.no} · Bill {a.billNo}
                    </span>
                  </span>
                  <span className="text-right text-[15px] tabular-nums text-foreground">
                    {formatQty(a.qty)} {a.unit} <span className="text-muted-foreground">{a.product}</span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No goods have been given to traders from this truck yet.</p>
        )}
      </section>
    </div>
  );
}

export function ExitPage() {
  const { user } = useAuth();
  const toast = useToast();
  const operator = user?.name ?? "Operator";
  const now = useNow(15_000);
  const params = useSearchParams();
  const urlQuery = params.get("q") ?? "";
  const scanRef = useRef<HTMLInputElement>(null);

  const [view, setView] = useState<View>("scan");
  const [code, setCode] = useState("");
  const [looking, setLooking] = useState(false);
  const [result, setResult] = useState<ScanLookup | null>(null);
  const [approving, setApproving] = useState(false);
  const [flagging, setFlagging] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const inside = useLiveQuery("inside", (attempt) =>
    getInside({ forceError: attempt === 0 && forcedErrors().has("inside") })
  );
  const all = inside.status === "ready" ? inside.data : [];

  const run = async (raw: string) => {
    if (!raw.trim() || looking) return;
    setLooking(true);
    setResult(null);
    const found = await lookupScan(raw);
    setLooking(false);
    setResult(found);
    setCode("");
  };

  // Arriving from an "Open exit" link looks the vehicle up straight away.
  useEffect(() => {
    if (!urlQuery) return;
    let live = true;
    lookupScan(urlQuery).then((r) => live && setResult(r));
    return () => {
      live = false;
    };
  }, [urlQuery]);

  const focusScan = () => setTimeout(() => scanRef.current?.focus(), 60);
  useEffect(() => {
    const t = setTimeout(() => scanRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);
  const scanAnother = () => {
    setResult(null);
    setCode("");
    setView("scan");
    focusScan();
  };
  useHotkey("/", () => {
    setView("scan");
    focusScan();
  });

  const demoScan = () => {
    const next = [...all].sort((a, b) => a.entryAt! - b.entryAt!)[0];
    if (next) void run(qrPayload(next));
  };

  const confirm = async () => {
    if (result?.kind !== "inside" || approving) return;
    setApproving(true);
    const done = await submitExit(result.movement.id, operator);
    setApproving(false);
    if (done) toast.push(`Exit approved for ${done.plate || done.fastag}. Its QR code is now closed.`);
    else toast.push("This vehicle is no longer inside.", "error");
    scanAnother();
  };

  const flag = async () => {
    if (result?.kind !== "none" || flagging) return;
    setFlagging(true);
    await submitFlag(result.code, operator);
    setFlagging(false);
    toast.push(`${result.code} flagged for a supervisor.`);
    scanAnother();
  };

  const m = result && result.kind !== "none" ? result.movement : null;

  return (
    <div className="flex flex-col gap-8 lg:gap-10">
      <PageHeader
        title="Gate Exit"
        description="Scan the entry QR code, check the details, then confirm the exit."
        actions={
          <Segmented
            label="Gate exit view"
            value={view}
            onChange={(v) => (v === "scan" ? scanAnother() : setView("table"))}
            options={[
              { value: "scan", label: "Scan QR" },
              { value: "table", label: inside.status === "ready" ? `Vehicles inside (${all.length})` : "Vehicles inside" },
            ]}
          />
        }
      />

      <div hidden={view !== "scan"} className="grid animate-in grid-cols-1 items-start gap-6 fade-in slide-in-from-bottom-2 duration-300 lg:grid-cols-2">
        <Card className="gap-0 p-0 [--card-spacing:--spacing(6)]">
          <div className="flex flex-col gap-6 p-6">
            <h2 className="text-[17px] tracking-[-0.2px] text-foreground">1. Scan the QR code</h2>
            <QrScanner onScan={(text) => void run(text)} disabled={looking} />
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void run(code);
              }}
            >
              <label htmlFor="exit-scan" className="text-sm text-foreground">
                Scanner field
              </label>
              <div className="relative">
                <ScanLineIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="exit-scan"
                  ref={scanRef}
                  data-page-search
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Scan with the handheld scanner, or type the entry number"
                  title="Scan (/)"
                  aria-keyshortcuts="/"
                  className="h-12 pr-12 pl-10"
                />
                {looking && <Spinner className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground" />}
              </div>
              <p className="text-caption text-muted-foreground">
                A handheld scanner types the code here and presses Enter. Press / to jump back to this field.
              </p>
            </form>
            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
              <Button type="button" variant="ghost" onClick={demoScan} disabled={looking || all.length === 0}>
                <QrCodeIcon aria-hidden="true" />
                Demo: scan the oldest vehicle inside
              </Button>
            </div>
          </div>
        </Card>

        <Card className="gap-0 p-0 [--card-spacing:--spacing(6)]">
          <div className="flex flex-col gap-6 p-6">
            <h2 className="text-[17px] tracking-[-0.2px] text-foreground">2. Check the details and confirm</h2>

            {!result && !looking && (
              <div className="flex min-h-80 flex-col items-center justify-center gap-3 text-center">
                <QrCodeIcon aria-hidden="true" className="size-8 text-muted-foreground" />
                <p className="text-body-md text-muted-foreground">Scan a QR code to see the vehicle here.</p>
              </div>
            )}

            {looking && (
              <div role="status" aria-label="Looking up the entry" className="flex min-h-80 flex-col gap-4">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-24 w-full" />
              </div>
            )}

            {result?.kind === "none" && (
              <div role="status" className="flex flex-col gap-4 rounded-card border border-border bg-muted p-5">
                <p className="flex items-start gap-2 text-[15px] text-foreground">
                  <InfoIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
                  No open entry found for {result.code}.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button variant="outline" onClick={scanAnother}>
                    Scan again
                  </Button>
                  <Button variant="outline" onClick={flag} disabled={flagging} aria-busy={flagging}>
                    {flagging && <Spinner />}
                    Flag for supervisor
                  </Button>
                </div>
              </div>
            )}

            {result?.kind === "exited" && m && (
              <div role="status" className="flex flex-col gap-4 rounded-card border border-border bg-muted p-5">
                <p className="flex items-start gap-2 text-[15px] text-foreground">
                  <InfoIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
                  {m.plate || m.fastag} already exited on {formatDate(m.exitAt!)} at {formatTime(m.exitAt!)}, after{" "}
                  {formatDuration(m.exitAt! - m.entryAt!)}. This QR code is closed and cannot be used again.
                </p>
                <div>
                  <Button variant="outline" onClick={scanAnother}>
                    Scan another
                  </Button>
                </div>
              </div>
            )}

            {result?.kind === "inside" && m && (
              <div className="flex flex-col gap-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-heading-lg break-all text-foreground">{m.plate || "No plate"}</p>
                    <p className="text-caption text-muted-foreground">Entry {m.entryNo}</p>
                  </div>
                  <StatusPill movement={m} />
                </div>
                <dl className="grid gap-4 sm:grid-cols-2">
                  <Fact label="Driver" value={m.driverName} />
                  <Fact label="FASTag" value={<span className="tabular-nums">{m.fastag || "No FASTag"}</span>} />
                  <Fact label="Vehicle type" value={m.vehicleType} />
                  <Fact label="Transporter" value={m.transporter} />
                  <Fact label="Purpose" value={m.purpose} />
                  <Fact label="Entered by" value={`${m.operator} · ${m.gate}`} />
                  <Fact label="Entry time" value={<span className="tabular-nums">{formatStamp(m.entryAt!)}</span>} />
                  <Fact label="Time inside" value={<Dwell ms={now ? now - m.entryAt! : null} />} />
                </dl>
                <TruckRecord movement={m} />
                <div className="flex flex-wrap items-center gap-3">
                  <Button size="lg" onClick={confirm} disabled={approving} aria-busy={approving}>
                    {approving && <Spinner />}
                    {approving ? "Confirming" : "Confirm exit"}
                  </Button>
                  <Button variant="ghost" size="lg" onClick={scanAnother} disabled={approving}>
                    Scan another
                  </Button>
                </div>
                <p className="text-caption text-muted-foreground">The exit time and your name are stamped automatically. Confirming closes this truck&apos;s QR code.</p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {view === "table" && (
        <Card className="animate-in gap-4 fade-in slide-in-from-bottom-2 duration-300">
          <CardHeader>
            <CardTitle className="text-heading-md">Vehicles currently inside</CardTitle>
            <CardDescription>
              {inside.status === "ready" ? `${all.length} inside, longest stay first` : "Longest stay first"}
            </CardDescription>
          </CardHeader>
          <div className="px-(--card-spacing)">
            {inside.status === "loading" && (
              <div className={BODY} role="status" aria-label="Loading vehicles inside">
                <div className="flex h-10 items-center">
                  <Skeleton className="h-4 w-24" />
                </div>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex h-14 items-center gap-4">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                ))}
              </div>
            )}
            {inside.status === "error" && <BlockError onRetry={inside.retry} className={BODY} />}
            {inside.status === "ready" && all.length === 0 && (
              <BlockEmpty icon={TruckIcon} text="No vehicles inside." actionLabel="Scan QR" onAction={scanAnother} className={BODY} />
            )}
            {inside.status === "ready" && all.length > 0 && (
              <DataTable
                id="gx"
                caption="Vehicles currently inside"
                columns={insideColumns(now)}
                rows={[...all].sort((a, b) => a.entryAt! - b.entryAt!)}
                rowKey={(v) => v.id}
                pageSize={10}
                actionLabel={(v) => `Actions for ${v.entryNo}`}
                actions={(v) => [
                  { label: "View", icon: EyeIcon, onSelect: () => setOpenId(v.id) },
                  { label: "Exit", icon: LogOutIcon, onSelect: () => void run(v.plate || v.fastag) },
                ]}
              />
            )}
          </div>
        </Card>
      )}

      <MovementDrawer
        id={openId}
        onClose={() => setOpenId(null)}
        exitAction={(key) => {
          setView("scan");
          void run(key);
        }}
      />
    </div>
  );
}
