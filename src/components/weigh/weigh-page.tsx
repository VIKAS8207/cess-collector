"use client";

import { DataTable, type Column } from "@/components/ui/data-table";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CameraIcon, EyeIcon, InfoIcon, QrCodeIcon, ScaleIcon, ScanLineIcon } from "lucide-react";
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
import { PhotoDialog } from "@/components/weigh/photo-dialog";
import { QrScanner } from "@/components/gate-exit/qr-scanner";
import { useAuth } from "@/lib/auth-store";
import { forcedErrors, getInside, getWeighments, lookupScan, submitWeighment, type ScanLookup } from "@/lib/api/gate";
import { activeLabels } from "@/lib/domain/admin-store";
import { nextStage, weighSummary, type Movement, type WeighStage } from "@/lib/domain/types";
import { formatDate, formatStamp, formatTime } from "@/lib/format";
import { useLiveQuery } from "@/hooks/use-live-query";
import { useHotkey } from "@/hooks/use-hotkey";

type View = "scan" | "table";
type Source = "bridge" | "manual";

const BODY = "h-[520px]";
const MAX_KG = 200_000;
const kgFmt = new Intl.NumberFormat("en-IN");
const kg = (n: number | undefined | null) => (n == null ? "—" : `${kgFmt.format(n)} kg`);

const weighColumns: Column<Movement>[] = [
  { key: "at", header: "Weighed", cell: (v) => <span className="text-caption tabular-nums text-muted-foreground">{formatStamp(v.weighments![0].at)}</span> },
  { key: "plate", header: "Vehicle", primary: true, cell: (v) => v.plate || "No plate" },
  { key: "no", header: "Entry no", cell: (v) => <span className="tabular-nums text-muted-foreground">{v.entryNo}</span> },
  { key: "product", header: "Product", cell: (v) => weighSummary(v).product || "—" },
  { key: "gross", header: "Gross", align: "right", cell: (v) => kg(weighSummary(v).gross?.kg) },
  { key: "tare", header: "Tare", align: "right", cell: (v) => kg(weighSummary(v).tare?.kg) },
  { key: "net", header: "Net", align: "right", cell: (v) => <span className="text-foreground">{kg(weighSummary(v).net)}</span> },
  {
    key: "stage",
    header: "Stage",
    cell: (v) => (weighSummary(v).tare ? <Pill tone="neutral">Complete</Pill> : <Pill tone="brand">Waiting for tare</Pill>),
  },
  { key: "status", header: "Status", cell: (v) => <StatusPill movement={v} /> },
];

/**
 * Stand-in for the bridge indicator. The number moves while the truck settles and
 * then holds steady. `below` keeps a tare reading under the gross weight. A real
 * bridge feed replaces this hook.
 */
function useBridgeReading(active: boolean, below?: number) {
  const [target] = useState(() => (below ? Math.round(below * (0.28 + Math.random() * 0.17)) : 18000 + Math.round(Math.random() * 24000)));
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), 120);
    return () => clearInterval(id);
  }, [active]);
  const progress = Math.min(1, tick / 22);
  const stable = progress >= 1;
  const reading = stable ? target : Math.max(0, Math.round(target * progress + Math.sin(tick * 7) * target * 0.04 * (1 - progress)));
  return { kg: reading, stable };
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="text-[15px] wrap-break-word text-foreground">{value || "—"}</dd>
    </div>
  );
}

function TruckHeader({ movement }: { movement: Movement }) {
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-heading-lg break-all text-foreground">{movement.plate || "No plate"}</p>
          <p className="text-caption text-muted-foreground">Entry {movement.entryNo}</p>
        </div>
        <StatusPill movement={movement} />
      </div>
      <dl className="grid gap-4 sm:grid-cols-2">
        <Fact label="Driver" value={movement.driverName} />
        <Fact label="FASTag" value={<span className="tabular-nums">{movement.fastag || "No FASTag"}</span>} />
        <Fact label="Vehicle type" value={movement.vehicleType} />
        <Fact label="Transporter" value={movement.transporter} />
        <Fact label="Purpose" value={movement.purpose} />
        <Fact label="Entry time" value={<span className="tabular-nums">{formatStamp(movement.entryAt!)}</span>} />
      </dl>
    </>
  );
}

function Photo({ src, label }: { src: string; label: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={label} className="aspect-8/5 w-full rounded-field border border-border object-cover" />
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
  onDone: (m: Movement, stage: WeighStage, weight: number) => void;
  onCancel: () => void;
}) {
  const stage = nextStage(movement);
  const summary = weighSummary(movement);
  const [source, setSource] = useState<Source>("bridge");
  const [manual, setManual] = useState("");
  const [product, setProduct] = useState(summary.product);
  const [photo, setPhoto] = useState<string | null>(null);
  const [camOpen, setCamOpen] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const bridge = useBridgeReading(source === "bridge" && stage !== null, summary.gross?.kg);

  if (!stage) {
    return (
      <div className="flex flex-col gap-6">
        <TruckHeader movement={movement} />
        <section className="flex flex-col gap-4 rounded-card border border-border p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[17px] tracking-[-0.2px] text-foreground">Weighing complete</h3>
            <Pill tone="neutral">{summary.product || "No product"}</Pill>
          </div>
          <dl className="grid gap-4 sm:grid-cols-3">
            <Fact label="Gross" value={<span className="tabular-nums">{kg(summary.gross?.kg)}</span>} />
            <Fact label="Tare" value={<span className="tabular-nums">{kg(summary.tare?.kg)}</span>} />
            <Fact label="Net goods" value={<span className="tabular-nums">{kg(summary.net)}</span>} />
          </dl>
          <div className="grid gap-3 sm:grid-cols-2">
            {summary.gross?.photo && <Photo src={summary.gross.photo} label="Gross weighing photo" />}
            {summary.tare?.photo && <Photo src={summary.tare.photo} label="Tare weighing photo" />}
          </div>
        </section>
        <div>
          <Button variant="outline" size="lg" onClick={onCancel}>
            Scan another
          </Button>
        </div>
      </div>
    );
  }

  const typed = Number(manual.replace(/,/g, ""));
  const manualError =
    manual.trim() === "" || Number.isNaN(typed) || typed <= 0
      ? "Enter the weight in kg."
      : typed > MAX_KG
        ? `That is above ${kgFmt.format(MAX_KG)} kg. Check the number.`
        : stage === "tare" && summary.gross && typed >= summary.gross.kg
          ? `Tare must be lighter than the gross weight of ${kg(summary.gross.kg)}.`
          : undefined;
  const weight = source === "bridge" ? bridge.kg : Math.round(typed);
  const weightReady = source === "bridge" ? bridge.stable : !manualError;
  // Tare is the empty truck, so only the gross weighing needs the product and a photo.
  const productError = stage === "tare" || product.trim() ? undefined : "Enter the product on the truck.";
  const photoError = stage === "tare" || photo ? undefined : "Take a photo of the truck on the bridge.";
  const ready = weightReady && !productError && !photoError;
  const net = stage === "tare" && summary.gross ? summary.gross.kg - weight : null;

  const save = async () => {
    setAttempted(true);
    setFailure(null);
    if (!ready || saving) return;
    setSaving(true);
    const res = await submitWeighment(movement.id, { kg: weight, source, product: stage === "tare" ? summary.product : product.trim(), photo: stage === "gross" ? (photo ?? undefined) : undefined }, operator);
    setSaving(false);
    if (res.ok) onDone(res.movement, stage, weight);
    else setFailure(res.reason);
  };

  const stageTitle = stage === "gross" ? "Gross weight" : "Tare weight";

  return (
    <div className="flex flex-col gap-6">
      <TruckHeader movement={movement} />

      <div className="flex flex-col gap-1 rounded-card bg-muted p-4">
        <p className="flex items-center gap-2 text-[15px] text-foreground">
          <Pill tone="brand">{stage === "gross" ? "First weighing" : "Second weighing"}</Pill>
          {stageTitle}
        </p>
        <p className="text-sm text-muted-foreground">
          {stage === "gross"
            ? "The truck is loaded. This is the gross weight."
            : `The goods have been delivered, so the truck is lighter. Gross was ${kg(summary.gross?.kg)}.`}
        </p>
      </div>

      <section aria-labelledby="wb-weight" className="flex flex-col gap-4 rounded-card border border-border p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id="wb-weight" className="text-[17px] tracking-[-0.2px] text-foreground">
            {stageTitle}
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

        {net !== null && net > 0 && (
          <p className="flex items-baseline justify-between gap-3 border-t border-border pt-3 text-sm text-muted-foreground">
            Net goods (gross − tare)
            <span className="text-[17px] tabular-nums text-foreground">{kg(net)}</span>
          </p>
        )}
      </section>

      {stage === "gross" ? (
        <section aria-labelledby="wb-goods" className="flex flex-col gap-4 rounded-card border border-border p-5">
          <h3 id="wb-goods" className="text-[17px] tracking-[-0.2px] text-foreground">
            Product and photo
          </h3>
          <TextField
            id="wb-product"
            label="Product on the truck"
            required
            list="wb-products"
            value={product}
            onChange={setProduct}
            error={attempted ? productError : undefined}
            hint="Choose from the list or type it."
            autoComplete="off"
            disabled={saving}
          />
          <datalist id="wb-products">
            {activeLabels("items").map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>

          <div className="flex flex-col gap-2">
            <p className="text-sm text-foreground">
              Photo <span aria-hidden="true" className="text-destructive">*</span>
            </p>
            {photo ? <Photo src={photo} label="Photo taken on the weight bridge" /> : (
              <div className="flex aspect-8/5 items-center justify-center rounded-field bg-muted">
                <CameraIcon aria-hidden="true" className="size-8 text-muted-foreground" />
              </div>
            )}
            <div>
              <Button type="button" variant="outline" onClick={() => setCamOpen(true)} disabled={saving}>
                <CameraIcon aria-hidden="true" />
                {photo ? "Retake photo" : "Take photo"}
              </Button>
            </div>
            {attempted && photoError && (
              <p role="alert" className="text-sm text-destructive">
                {photoError}
              </p>
            )}
          </div>
        </section>
      ) : (
        <p className="flex items-baseline justify-between gap-3 rounded-card border border-border p-5 text-sm text-muted-foreground">
          Carrying (from the gross weighing)
          <span className="text-[15px] text-foreground">{summary.product || "—"}</span>
        </p>
      )}

      {failure && (
        <p role="alert" className="text-sm text-destructive">
          {failure}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={save} disabled={saving} aria-busy={saving}>
          {saving && <Spinner />}
          {saving ? "Saving" : "Done"}
        </Button>
        <Button variant="ghost" size="lg" onClick={onCancel} disabled={saving}>
          Scan another
        </Button>
      </div>
      <p className="text-caption text-muted-foreground">
        {stage === "gross"
          ? "The weight, product and photo are saved on this truck&apos;s record with the time and your name."
          : "The tare weight is saved on this truck&apos;s record with the time and your name."}
      </p>

      <PhotoDialog
        open={camOpen}
        title={`${stageTitle} photo`}
        onClose={() => setCamOpen(false)}
        onUse={(img) => {
          setPhoto(img);
          setCamOpen(false);
        }}
      />
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

  // Demo button: gross for a truck, then tare for the same truck, then gross for the next one.
  const demoTare = useRef<string | null>(null);
  const demoScan = () => {
    const sorted = [...insideList].sort((a, b) => a.entryAt! - b.entryAt!);
    const again = demoTare.current ? sorted.find((m) => m.id === demoTare.current && nextStage(m) === "tare") : undefined;
    const pick = again ?? sorted.find((m) => nextStage(m) === "gross") ?? sorted.find((m) => nextStage(m) !== null) ?? sorted[0];
    if (pick) void run(qrPayload(pick));
  };

  const onDone = (m: Movement, stage: WeighStage, weight: number) => {
    toast.push(`${stage === "gross" ? "Gross" : "Tare"} ${kgFmt.format(weight)} kg saved for ${m.plate || m.fastag}.`);
    demoTare.current = stage === "gross" ? m.id : null;
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
        description="Scan the entry QR code. The first weighing is gross: add the product and a photo. The second is tare, the empty truck: just the weight."
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
                <p className="text-body-md text-muted-foreground">Scan a QR code to see the truck and weigh it here.</p>
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
              <DataTable
                id="wb"
                caption="Weighments"
                columns={weighColumns}
                rows={weighedList}
                rowKey={(v) => v.id}
                highlightId={highlight}
                pageSize={10}
                actionLabel={(v) => `Actions for ${v.entryNo}`}
                actions={(v) => [{ label: "View", icon: EyeIcon, onSelect: () => setOpenId(v.id) }]}
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
