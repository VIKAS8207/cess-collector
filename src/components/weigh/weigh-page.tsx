"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { InfoIcon, QrCodeIcon, ScaleIcon, ScanLineIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/ui/pill";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { TextField } from "@/components/auth/text-field";
import { BlockEmpty, BlockError } from "@/components/dashboard/block-states";
import { PageHeader } from "@/components/gate/page-header";
import { MovementDrawer } from "@/components/gate/movement-drawer";
import { qrPayload } from "@/components/gate/qr-code";
import { StatusPill } from "@/components/gate/status-pill";
import { useToast } from "@/components/gate/toast";
import { QrScanner } from "@/components/gate-exit/qr-scanner";
import { useAuth } from "@/lib/auth-store";
import { forcedErrors, getInside, getWeighments, lookupScan, submitWeighment, type ScanLookup } from "@/lib/api/gate";
import type { Movement } from "@/lib/domain/types";
import { formatDate, formatStamp, formatTime } from "@/lib/format";
import { useLiveQuery } from "@/hooks/use-live-query";
import { useHotkey } from "@/hooks/use-hotkey";
import { cn } from "cn";

type View = "scan" | "table";
type Source = "bridge" | "manual";

const BODY = "h-[520px]";
const MAX_KG = 200_000;
const kgFmt = new Intl.NumberFormat("en-IN");
const sourceLabel = (s: Source) => (s === "bridge" ? "Weight bridge" : "Typed in");

/**
 * Stand-in for the bridge indicator. The number moves while the truck settles and
 * then holds steady. A real bridge feed replaces this hook.
 */
function useBridgeReading(active: boolean) {
  const [target] = useState(() => 8000 + Math.round(Math.random() * 34000));
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), 120);
    return () => clearInterval(id);
  }, [active]);
  const progress = Math.min(1, tick / 22);
  const stable = progress >= 1;
  const kg = stable ? target : Math.max(0, Math.round(target * progress + Math.sin(tick * 7) * target * 0.04 * (1 - progress)));
  return { kg, stable };
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="text-[15px] wrap-break-word text-foreground">{value || "—"}</dd>
    </div>
  );
}

function WeighPanel({
  movement,
  operator,
  onDone,
  onCancel,
}: {
  movement: Movement;
  operator: string;
  onDone: (m: Movement, kg: number) => void;
  onCancel: () => void;
}) {
  const [source, setSource] = useState<Source>("bridge");
  const [manual, setManual] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const bridge = useBridgeReading(source === "bridge");

  const typed = Number(manual.replace(/,/g, ""));
  const manualError =
    manual.trim() === "" || Number.isNaN(typed) || typed <= 0
      ? "Enter the weight in kg."
      : typed > MAX_KG
        ? `That is above ${kgFmt.format(MAX_KG)} kg. Check the number.`
        : undefined;
  const kg = source === "bridge" ? bridge.kg : Math.round(typed);
  const ready = source === "bridge" ? bridge.stable : !manualError;

  const save = async () => {
    setAttempted(true);
    if (!ready || saving) return;
    setSaving(true);
    const done = await submitWeighment(movement.id, { kg, source }, operator);
    setSaving(false);
    if (done) onDone(done, kg);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-heading-lg break-all text-foreground">{movement.plate || "No plate"}</p>
          <p className="text-caption text-muted-foreground">Entry {movement.entryNo}</p>
        </div>
        <StatusPill movement={movement} />
      </div>

      <dl className="grid gap-4 sm:grid-cols-2">
        <Fact label="Driver" value={movement.driverName} />
        <Fact label="Driver phone" value={<span className="tabular-nums">{movement.driverPhone}</span>} />
        <Fact label="FASTag" value={<span className="tabular-nums">{movement.fastag || "No FASTag"}</span>} />
        <Fact label="Vehicle type" value={movement.vehicleType} />
        <Fact label="Transporter" value={movement.transporter} />
        <Fact label="Purpose" value={movement.purpose} />
        <Fact label="Entry time" value={<span className="tabular-nums">{formatStamp(movement.entryAt!)}</span>} />
        <Fact label="Reference" value={movement.reference} />
      </dl>

      <section aria-labelledby="wb-weight" className="flex flex-col gap-4 rounded-card border border-border p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id="wb-weight" className="text-[17px] tracking-[-0.2px] text-foreground">
            Weight
          </h3>
          <Segmented
            label="Weight source"
            value={source}
            onChange={(v) => {
              setSource(v);
              setAttempted(false);
            }}
            options={[
              { value: "bridge", label: "From weight bridge" },
              { value: "manual", label: "Enter manually" },
            ]}
            disabled={saving}
          />
        </div>

        {source === "bridge" ? (
          <div role="status" aria-live="polite" className="flex flex-col items-center gap-2 rounded-field bg-muted px-4 py-6 text-center">
            <p className="text-display-lg tabular-nums text-foreground">
              {kgFmt.format(bridge.kg)} <span className="text-heading-md text-muted-foreground">kg</span>
            </p>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              {bridge.stable ? (
                <Pill tone="brand">Stable</Pill>
              ) : (
                <>
                  <Spinner />
                  Reading from the weight bridge
                </>
              )}
            </p>
          </div>
        ) : (
          <TextField
            id="wb-manual"
            label="Weight (kg)"
            required
            inputMode="numeric"
            value={manual}
            onChange={setManual}
            error={attempted ? manualError : undefined}
            hint="Use this when the bridge display is not available."
            autoComplete="off"
            disabled={saving}
          />
        )}
      </section>

      {(movement.weighments?.length ?? 0) > 0 && (
        <section aria-label="Earlier weighments" className="flex flex-col gap-2">
          <h3 className="text-sm text-muted-foreground">Earlier weighments for this truck</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {movement.weighments!.map((w, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="tabular-nums text-foreground">{kgFmt.format(w.kg)} kg</span>
                <span className="text-caption text-muted-foreground">
                  {sourceLabel(w.source)} · {formatStamp(w.at)} · {w.by}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={save} disabled={!ready || saving} aria-busy={saving}>
          {saving && <Spinner />}
          {saving ? "Saving" : "Done"}
        </Button>
        <Button variant="ghost" size="lg" onClick={onCancel} disabled={saving}>
          Scan another
        </Button>
      </div>
      <p className="text-caption text-muted-foreground">
        The weight is saved on this truck&apos;s record with the time and your name.
      </p>
    </div>
  );
}

export function WeighPage() {
  const { user } = useAuth();
  const toast = useToast();
  const operator = user?.name ?? "Operator";
  const params = useSearchParams();
  const urlQuery = params.get("q") ?? "";
  const scanRef = useRef<HTMLInputElement>(null);

  const [view, setView] = useState<View>("scan");
  const [code, setCode] = useState("");
  const [looking, setLooking] = useState(false);
  const [result, setResult] = useState<ScanLookup | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);

  const inside = useLiveQuery("wb-inside", (a) => getInside({ forceError: a === 0 && forcedErrors().has("inside") }));
  const weighed = useLiveQuery("wb-weighed", (a) => getWeighments({ forceError: a === 0 && forcedErrors().has("weighments") }));
  const insideList = inside.status === "ready" ? inside.data : [];

  const run = async (raw: string) => {
    if (!raw.trim() || looking) return;
    setLooking(true);
    setResult(null);
    const found = await lookupScan(raw);
    setLooking(false);
    setResult(found);
    setCode("");
  };

  useEffect(() => {
    if (!urlQuery) return;
    let live = true;
    lookupScan(urlQuery).then((r) => live && setResult(r));
    return () => {
      live = false;
    };
  }, [urlQuery]);

  useEffect(() => {
    const t = setTimeout(() => scanRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  const scanAnother = () => {
    setResult(null);
    setCode("");
    setView("scan");
    setTimeout(() => scanRef.current?.focus(), 60);
  };
  useHotkey("/", () => {
    setView("scan");
    setTimeout(() => scanRef.current?.focus(), 60);
  });

  const demoScan = () => {
    const withoutWeight = [...insideList].sort((a, b) => a.entryAt! - b.entryAt!).find((m) => !m.weighments?.length) ?? insideList[0];
    if (withoutWeight) void run(qrPayload(withoutWeight));
  };

  const onDone = (m: Movement, kg: number) => {
    toast.push(`${kgFmt.format(kg)} kg saved for ${m.plate || m.fastag}.`);
    setHighlight(m.id);
    setTimeout(() => setHighlight((h) => (h === m.id ? null : h)), 3000);
    scanAnother();
  };

  const m = result && result.kind !== "none" ? result.movement : null;
  const weighedList = weighed.status === "ready" ? weighed.data : [];

  return (
    <div className="flex flex-col gap-8 lg:gap-10">
      <PageHeader
        title="Weight Bridge"
        description="Scan the entry QR code, read the weight, then press Done to keep it with the truck."
        actions={
          <Segmented
            label="Weight bridge view"
            value={view}
            onChange={(v) => (v === "scan" ? scanAnother() : setView("table"))}
            options={[
              { value: "scan", label: "Scan QR" },
              { value: "table", label: weighed.status === "ready" ? `Weighments (${weighedList.length})` : "Weighments" },
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
              <label htmlFor="wb-scan" className="text-sm text-foreground">
                Scanner field
              </label>
              <div className="relative">
                <ScanLineIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="wb-scan"
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
              <Button type="button" variant="ghost" onClick={demoScan} disabled={looking || insideList.length === 0}>
                <QrCodeIcon aria-hidden="true" />
                Demo: scan a vehicle that is inside
              </Button>
            </div>
          </div>
        </Card>

        <Card className="gap-0 p-0 [--card-spacing:--spacing(6)]">
          <div className="flex flex-col gap-6 p-6">
            <h2 className="text-[17px] tracking-[-0.2px] text-foreground">2. Weigh and save</h2>

            {!result && !looking && (
              <div className="flex min-h-80 flex-col items-center justify-center gap-3 text-center">
                <ScaleIcon aria-hidden="true" className="size-8 text-muted-foreground" />
                <p className="text-body-md text-muted-foreground">Scan a QR code to see the truck and its weight here.</p>
              </div>
            )}

            {looking && (
              <div role="status" aria-label="Looking up the entry" className="flex min-h-80 flex-col gap-4">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-32 w-full" />
              </div>
            )}

            {result?.kind === "none" && (
              <div role="status" className="flex flex-col gap-4 rounded-card border border-border bg-muted p-5">
                <p className="flex items-start gap-2 text-[15px] text-foreground">
                  <InfoIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
                  No open entry found for {result.code}.
                </p>
                <div>
                  <Button variant="outline" onClick={scanAnother}>
                    Scan again
                  </Button>
                </div>
              </div>
            )}

            {result?.kind === "exited" && m && (
              <div role="status" className="flex flex-col gap-4 rounded-card border border-border bg-muted p-5">
                <p className="flex items-start gap-2 text-[15px] text-foreground">
                  <InfoIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
                  {m.plate || m.fastag} already left on {formatDate(m.exitAt!)} at {formatTime(m.exitAt!)}. It cannot be weighed now.
                </p>
                <div>
                  <Button variant="outline" onClick={scanAnother}>
                    Scan another
                  </Button>
                </div>
              </div>
            )}

            {result?.kind === "inside" && m && (
              <WeighPanel key={m.id} movement={m} operator={operator} onDone={onDone} onCancel={scanAnother} />
            )}
          </div>
        </Card>
      </div>

      {view === "table" && (
        <Card className="animate-in gap-4 fade-in slide-in-from-bottom-2 duration-300">
          <CardHeader>
            <CardTitle className="text-heading-md">Weighments</CardTitle>
            <CardDescription>
              {weighed.status === "ready" ? `${weighedList.length} trucks weighed, latest first` : "Latest first"}
            </CardDescription>
          </CardHeader>
          <div className="px-(--card-spacing)">
            {weighed.status === "loading" && (
              <div className={BODY} role="status" aria-label="Loading weighments">
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
            {weighed.status === "error" && <BlockError onRetry={weighed.retry} className={BODY} />}
            {weighed.status === "ready" && weighedList.length === 0 && (
              <BlockEmpty icon={ScaleIcon} text="No trucks weighed yet." actionLabel="Scan QR" onAction={scanAnother} className={BODY} />
            )}
            {weighed.status === "ready" && weighedList.length > 0 && (
              <div className={cn(BODY, "overflow-auto")}>
                <table className="w-full min-w-205 text-[15px]">
                  <caption className="sr-only">Weighments</caption>
                  <thead>
                    <tr className="h-10 border-b border-border text-left text-caption text-muted-foreground">
                      <th scope="col" className="pr-4 font-normal">Weighed</th>
                      <th scope="col" className="pr-4 font-normal">Vehicle</th>
                      <th scope="col" className="pr-4 font-normal">Entry no</th>
                      <th scope="col" className="pr-4 font-normal">Driver</th>
                      <th scope="col" className="pr-4 text-right font-normal">Weight</th>
                      <th scope="col" className="pr-4 pl-4 font-normal">Source</th>
                      <th scope="col" className="pr-4 font-normal">Weighed by</th>
                      <th scope="col" className="font-normal">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weighedList.map((v) => {
                      const w = v.weighments![0];
                      return (
                        <tr
                          key={v.id}
                          onClick={() => setOpenId(v.id)}
                          className={cn(
                            "h-14 cursor-pointer border-b border-border transition-colors duration-700 last:border-b-0 hover:bg-muted",
                            highlight === v.id && "bg-tag/40"
                          )}
                        >
                          <td className="pr-4 text-caption tabular-nums whitespace-nowrap text-muted-foreground">{formatStamp(w.at)}</td>
                          <th scope="row" className="pr-4 text-left font-normal">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenId(v.id);
                              }}
                              className="rounded-field text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                            >
                              {v.plate || "No plate"}
                            </button>
                          </th>
                          <td className="pr-4 tabular-nums text-muted-foreground">{v.entryNo}</td>
                          <td className="pr-4">{v.driverName}</td>
                          <td className="pr-4 text-right tabular-nums text-foreground">{kgFmt.format(w.kg)} kg</td>
                          <td className="pr-4 pl-4">
                            <Pill tone={w.source === "bridge" ? "brand" : "neutral"}>{sourceLabel(w.source)}</Pill>
                          </td>
                          <td className="pr-4">{w.by}</td>
                          <td>
                            <StatusPill movement={v} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
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
