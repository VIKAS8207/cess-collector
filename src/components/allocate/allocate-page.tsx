"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeftIcon, ArrowRightIcon, CameraIcon, CheckIcon, EyeIcon, InfoIcon, PlusIcon, QrCodeIcon, ScanLineIcon, SplitIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/ui/pill";
import { Segmented } from "@/components/ui/segmented";
import { SelectField } from "@/components/ui/select-field";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { TextField } from "@/components/auth/text-field";
import { BlockEmpty, BlockError } from "@/components/dashboard/block-states";
import { PageHeader } from "@/components/gate/page-header";
import { qrPayload } from "@/components/gate/qr-code";
import { StatusPill } from "@/components/gate/status-pill";
import { useToast } from "@/components/gate/toast";
import { QrScanner } from "@/components/gate-exit/qr-scanner";
import { PhotoDialog } from "@/components/weigh/photo-dialog";
import { AllocationDialog } from "@/components/allocate/allocation-dialog";
import { useAuth } from "@/lib/auth-store";
import { activeTraders, getAllocations, getVehicleAllocations, submitAllocations } from "@/lib/api/agent";
import { forcedErrors, getInside, lookupScan, type ScanLookup } from "@/lib/api/gate";
import { activeLabels } from "@/lib/domain/admin-store";
import { cessFor, toNum } from "@/lib/domain/agent-math";
import { cessStatusLabel, payModes, units, type Allocation, type PayMode, type Unit } from "@/lib/domain/agent-types";
import { saasSettings } from "@/lib/domain/settings";
import { weighSummary, type Movement } from "@/lib/domain/types";
import { formatInr, formatQty, formatStamp } from "@/lib/format";
import { useLiveQuery } from "@/hooks/use-live-query";
import { useHotkey } from "@/hooks/use-hotkey";
import { cn } from "cn";

type View = "allocate" | "list";
type Draft = {
  key: string;
  partyId: string;
  partyName: string;
  qty: number;
  rate: number;
  billNo: string;
  licence: string;
  gstin: string;
  received: number;
  mode?: PayMode;
  ref: string;
};

const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const modeOptions = payModes.map((m) => ({ value: m.value, label: m.label }));
const kgFmt = new Intl.NumberFormat("en-IN");

const BODY = "h-[520px]";
const unitOptions = units.map((u) => ({ value: u, label: u }));

const steps = [
  { title: "Scan truck", hint: "Scan the QR" },
  { title: "Product", hint: "Name and photo" },
  { title: "Traders", hint: "Split the goods" },
  { title: "Review", hint: "Check and save" },
] as const;

const columns: Column<Allocation>[] = [
  { key: "at", header: "Time", cell: (a) => <span className="text-caption tabular-nums text-muted-foreground">{formatStamp(a.at)}</span> },
  { key: "no", header: "Allocation", cell: (a) => <span className="tabular-nums text-muted-foreground">{a.no}</span> },
  { key: "plate", header: "Vehicle", primary: true, cell: (a) => a.plate || "No plate" },
  { key: "product", header: "Product", cell: (a) => a.product },
  { key: "trader", header: "Trader", cell: (a) => a.partyName },
  { key: "qty", header: "Quantity", align: "right", cell: (a) => `${formatQty(a.qty)} ${a.unit}` },
  { key: "rate", header: "Rate", align: "right", hideBelow: "2xl", cell: (a) => formatInr(a.rate) },
  { key: "amount", header: "Amount", align: "right", cell: (a) => formatInr(a.amount) },
  { key: "cess", header: "CESS", align: "right", cell: (a) => <span className="text-foreground">{formatInr(a.cess)}</span> },
  {
    key: "cessStatus",
    header: "CESS status",
    cell: (a) => <Pill tone={a.cessStatus === "collected" ? "neutral" : a.cessStatus === "part" ? "brand" : "danger"}>{cessStatusLabel[a.cessStatus]}</Pill>,
  },
];

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="text-[15px] wrap-break-word text-foreground">{value || "—"}</dd>
    </div>
  );
}

/** Progress bar across the top: done steps get a tick, the current step is filled, later steps wait. */
function Stepper({ step, onGo }: { step: number; onGo: (n: number) => void }) {
  return (
    <nav aria-label="Allocation steps">
      <p className="mb-3 text-sm text-muted-foreground sm:hidden">
        Step {step} of {steps.length}: {steps[step - 1].title}
      </p>
      <ol className="flex items-start">
        {steps.map((s, i) => {
          const n = i + 1;
          const done = n < step;
          const current = n === step;
          return (
            <li key={s.title} className={cn("flex items-start", i < steps.length - 1 && "flex-1")}>
              <button
                type="button"
                onClick={() => done && onGo(n)}
                disabled={!done}
                aria-current={current ? "step" : undefined}
                className="group flex items-start gap-3 rounded-field text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-default"
              >
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-full border text-sm tabular-nums",
                    done && "border-primary bg-primary text-primary-foreground",
                    current && "border-primary bg-tag text-primary",
                    !done && !current && "border-border bg-background text-muted-foreground"
                  )}
                >
                  {done ? <CheckIcon aria-hidden="true" className="size-4" /> : n}
                </span>
                <span className="hidden flex-col sm:flex">
                  <span className={cn("text-[15px]", current || done ? "text-foreground" : "text-muted-foreground")}>{s.title}</span>
                  <span className="text-caption text-muted-foreground">{s.hint}</span>
                </span>
              </button>
              {i < steps.length - 1 && (
                <span aria-hidden="true" className={cn("mx-3 mt-[18px] h-0.5 min-w-6 flex-1 rounded-full", done ? "bg-primary" : "bg-border")} />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function TruckStrip({ movement }: { movement: Movement }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-card bg-muted px-4 py-3">
      <div className="flex min-w-0 flex-col">
        <span className="text-[17px] break-all text-foreground">{movement.plate || "No plate"}</span>
        <span className="text-caption text-muted-foreground">
          {movement.entryNo} · {movement.driverName} · {movement.vehicleType}
        </span>
      </div>
      <StatusPill movement={movement} />
    </div>
  );
}

/** Steps 2 to 4 for one truck. Keyed by truck, so scanning another starts clean. */
function TruckSteps({
  movement,
  agent,
  step,
  onStep,
  onSaved,
}: {
  movement: Movement;
  agent: string;
  step: number;
  onStep: (n: number) => void;
  onSaved: (made: Allocation[]) => void;
}) {
  const earlier = getVehicleAllocations(movement.id);
  const last = earlier[0];
  const traderList = activeTraders();
  const [product, setProduct] = useState(last?.product ?? "");
  const [unit, setUnit] = useState<Unit>(last?.unit ?? "bags");
  const [photo, setPhoto] = useState<string | null>(last?.photo ?? null);
  const [supplier, setSupplier] = useState(last?.supplier ?? "");
  const [origin, setOrigin] = useState(last?.origin ?? "");
  const [challan, setChallan] = useState(last?.challanNo ?? "");
  const [camOpen, setCamOpen] = useState(false);
  const [draft, setDraft] = useState<Draft[]>([]);
  const [partyId, setPartyId] = useState("");
  const [qty, setQty] = useState("");
  const [rate, setRate] = useState("");
  const [billNo, setBillNo] = useState("");
  const [licence, setLicence] = useState("");
  const [gstin, setGstin] = useState("");
  const [when, setWhen] = useState<"now" | "later">("now");
  const [mode, setMode] = useState<PayMode>("cash");
  const [received, setReceived] = useState("");
  const [ref, setRef] = useState("");
  const bridge = weighSummary(movement);
  const [lineTried, setLineTried] = useState(false);
  const [triedStep, setTriedStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const cfg = saasSettings();
  const used = new Set(draft.map((d) => d.partyId));
  const free = traderList.filter((t) => !used.has(t.id));
  const qtyN = toNum(qty);
  const rateN = toNum(rate);
  const preview = qtyN > 0 && rateN > 0 ? Math.round(qtyN * rateN * 100) / 100 : 0;
  const previewCess = cessFor(cfg, preview);
  const receivedN = received.trim() === "" ? previewCess.amount : toNum(received);
  const lineErrors = {
    party: partyId ? undefined : "Choose a trader.",
    qty: qtyN > 0 ? undefined : "Enter the quantity.",
    rate: rateN > 0 ? undefined : "Enter the rate.",
    bill: billNo.trim() ? undefined : "Enter the bill or voucher number.",
    gstin: !gstin.trim() || GSTIN_RE.test(gstin.trim().toUpperCase()) ? undefined : "A GSTIN has 15 characters, like 27ABCDE1234F1Z5.",
    received:
      when === "later"
        ? undefined
        : !(receivedN > 0)
          ? "Enter the CESS received."
          : receivedN > previewCess.amount
            ? `Cannot be more than the CESS of ${formatInr(previewCess.amount)}.`
            : undefined,
    ref: when === "now" && mode !== "cash" && !ref.trim() ? "Enter the payment reference." : undefined,
  };
  const lineOk = Object.values(lineErrors).every((e) => !e);

  const productError = product.trim() ? undefined : "Enter the product on the truck.";
  const supplierError = supplier.trim() ? undefined : "Enter who the goods came from.";
  const photoError = photo ? undefined : "Take a photo of the truck's product.";
  const linesError = draft.length > 0 ? undefined : "Add at least one trader.";

  const addLine = () => {
    setLineTried(true);
    if (!lineOk) return;
    const party = traderList.find((t) => t.id === partyId)!;
    setDraft((d) => [
      ...d,
      {
        key: `${partyId}-${d.length}`,
        partyId,
        partyName: party.name,
        qty: qtyN,
        rate: rateN,
        billNo: billNo.trim(),
        licence: licence.trim(),
        gstin: gstin.trim().toUpperCase(),
        received: when === "now" ? receivedN : 0,
        mode: when === "now" ? mode : undefined,
        ref: when === "now" ? ref.trim() : "",
      },
    ]);
    setPartyId("");
    setQty("");
    setRate("");
    setBillNo("");
    setLicence("");
    setGstin("");
    setWhen("now");
    setReceived("");
    setRef("");
    setLineTried(false);
    setTimeout(() => document.getElementById("al-trader")?.focus(), 50);
  };

  const lineAmount = (d: Draft) => Math.round(d.qty * d.rate * 100) / 100;
  const totals = draft.reduce(
    (t, d) => {
      const amount = lineAmount(d);
      return { qty: t.qty + d.qty, amount: t.amount + amount, cess: t.cess + cessFor(cfg, amount).amount, paid: t.paid + d.received };
    },
    { qty: 0, amount: 0, cess: 0, paid: 0 }
  );

  const next = () => {
    setTriedStep(step);
    if (step === 2 && (productError || photoError || supplierError)) return;
    if (step === 3 && linesError) return;
    onStep(step + 1);
  };

  const save = async () => {
    setFailure(null);
    if (saving) return;
    setSaving(true);
    const res = await submitAllocations(
      {
        movementId: movement.id,
        product: product.trim(),
        unit,
        photo: photo ?? undefined,
        supplier: supplier.trim(),
        origin: origin.trim(),
        challanNo: challan.trim(),
        lines: draft.map((d) => ({
          partyId: d.partyId,
          qty: d.qty,
          rate: d.rate,
          billNo: d.billNo,
          traderLicence: d.licence,
          traderGstin: d.gstin,
          cessReceived: d.received,
          cessMode: d.mode,
          cessRef: d.ref,
        })),
      },
      agent
    );
    setSaving(false);
    if (res.ok) onSaved(res.allocations);
    else setFailure(res.message);
  };

  return (
    <div className="flex flex-col gap-6">
      <TruckStrip movement={movement} />

      {step === 2 && (
        <section aria-labelledby="al-s2" className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h2 id="al-s2" className="text-heading-md text-foreground">
              What is on the truck?
            </h2>
            <p className="text-sm text-muted-foreground">Name the product and take a photo of the goods.</p>
          </div>
          {earlier.length > 0 && (
            <div className="flex flex-col gap-1 rounded-card border border-border p-4 text-sm">
              <p className="text-foreground">Already allocated from this truck</p>
              <ul className="flex flex-col gap-0.5 text-muted-foreground">
                {earlier.map((a) => (
                  <li key={a.id} className="flex justify-between gap-3">
                    <span>{a.partyName}</span>
                    <span className="tabular-nums">
                      {formatQty(a.qty)} {a.unit} · {formatInr(a.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <TextField
              id="al-product"
              label="Product on the truck"
              required
              list="al-products"
              value={product}
              onChange={setProduct}
              error={triedStep === 2 ? productError : undefined}
              hint="Choose from the list or type it."
              autoComplete="off"
            />
            <SelectField id="al-unit" label="Unit" value={unit} onChange={(v) => setUnit(v as Unit)} options={unitOptions} />
          </div>
          <datalist id="al-products">
            {activeLabels("items").map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>

          <div className="flex flex-col gap-4 rounded-card border border-border p-4">
            <div className="flex flex-col gap-1">
              <h3 className="text-[15px] text-foreground">Consignment</h3>
              <p className="text-caption text-muted-foreground">Where the goods came from. CESS is assessed on this record.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                id="al-supplier"
                label="Supplier or farmer"
                required
                value={supplier}
                onChange={setSupplier}
                error={triedStep === 2 ? supplierError : undefined}
                autoComplete="off"
              />
              <TextField id="al-origin" label="Origin (village or town)" value={origin} onChange={setOrigin} autoComplete="off" />
              <TextField id="al-challan" label="Seller challan or invoice no" value={challan} onChange={setChallan} hint="Optional" autoComplete="off" />
              <div className="flex flex-col gap-1">
                <p className="text-sm text-foreground">Weight at the bridge</p>
                <p className="text-[15px] text-foreground">
                  {bridge.net !== null
                    ? `Net ${kgFmt.format(bridge.net)} kg (gross ${kgFmt.format(bridge.gross!.kg)}, tare ${kgFmt.format(bridge.tare!.kg)})`
                    : bridge.gross
                      ? `Gross ${kgFmt.format(bridge.gross.kg)} kg. Tare not taken yet.`
                      : "Not weighed yet"}
                </p>
                <p className="text-caption text-muted-foreground">Read from the weight bridge. It is saved with each allocation.</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm text-foreground">
              Photo of the product <span aria-hidden="true" className="text-destructive">*</span>
            </p>
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="Photo of the truck's product" className="aspect-8/5 w-full max-w-80 rounded-field border border-border object-cover" />
            ) : (
              <div className="flex aspect-8/5 w-full max-w-80 items-center justify-center rounded-field bg-muted">
                <CameraIcon aria-hidden="true" className="size-8 text-muted-foreground" />
              </div>
            )}
            <div>
              <Button type="button" variant="outline" onClick={() => setCamOpen(true)}>
                <CameraIcon aria-hidden="true" />
                {photo ? "Retake photo" : "Take photo"}
              </Button>
            </div>
            {triedStep === 2 && photoError && (
              <p role="alert" className="text-sm text-destructive">
                {photoError}
              </p>
            )}
          </div>
        </section>
      )}

      {step === 3 && (
        <section aria-labelledby="al-s3" className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h2 id="al-s3" className="text-heading-md text-foreground">
              Who is taking the goods?
            </h2>
            <p className="text-sm text-muted-foreground">
              Add one line for each trader taking {product || "goods"} from this truck. CESS is worked out from the rate set by the admin.
            </p>
          </div>

          {draft.length > 0 && (
            <ul className="flex flex-col rounded-card border border-border px-4">
              {draft.map((d) => {
                const amount = lineAmount(d);
                return (
                  <li key={d.key} className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-b-0">
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[15px] text-foreground">{d.partyName}</span>
                      <span className="text-caption tabular-nums text-muted-foreground">
                        {formatQty(d.qty)} {unit} × {formatInr(d.rate)} · Bill {d.billNo}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="flex flex-col items-end">
                        <span className="tabular-nums text-foreground">{formatInr(amount)}</span>
                        <span className="text-caption tabular-nums text-muted-foreground">
                          CESS {formatInr(cessFor(cfg, amount).amount)} · {d.received > 0 ? `${formatInr(d.received)} received` : "pending"}
                        </span>
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${d.partyName}`}
                        onClick={() => setDraft((x) => x.filter((y) => y.key !== d.key))}
                      >
                        <Trash2Icon aria-hidden="true" />
                      </Button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <SelectField
              id="al-trader"
              label="Trader"
              required
              value={partyId}
              onChange={setPartyId}
              options={[{ value: "", label: free.length ? "Select trader" : "All traders added" }, ...free.map((t) => ({ value: t.id, label: t.name }))]}
              error={lineTried ? lineErrors.party : undefined}
              disabled={free.length === 0}
            />
            <TextField
              id="al-qty"
              label={`Quantity (${unit})`}
              required
              inputMode="decimal"
              value={qty}
              onChange={setQty}
              error={lineTried ? lineErrors.qty : undefined}
              autoComplete="off"
            />
            <TextField
              id="al-rate"
              label={`Rate (₹ per ${unit})`}
              required
              inputMode="decimal"
              value={rate}
              onChange={setRate}
              error={lineTried ? lineErrors.rate : undefined}
              autoComplete="off"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <TextField
              id="al-bill"
              label="Bill or voucher no"
              required
              value={billNo}
              onChange={setBillNo}
              error={lineTried ? lineErrors.bill : undefined}
              autoComplete="off"
            />
            <TextField id="al-licence" label="Trader licence no" value={licence} onChange={setLicence} hint="Optional" autoComplete="off" />
            <TextField
              id="al-gstin"
              label="Trader GSTIN"
              value={gstin}
              onChange={(v) => setGstin(v.toUpperCase())}
              error={lineTried ? lineErrors.gstin : undefined}
              hint="Optional"
              maxLength={15}
              autoComplete="off"
            />
          </div>

          <div className="flex flex-col gap-4 rounded-card border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-[15px] text-foreground">CESS collection</h3>
              <Segmented
                label="When is the CESS collected"
                value={when}
                onChange={(v) => setWhen(v)}
                options={[
                  { value: "now", label: "Collect now" },
                  { value: "later", label: "Collect later" },
                ]}
              />
            </div>
            <dl className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <dt className="text-caption text-muted-foreground">Goods value</dt>
                <dd className="tabular-nums text-foreground">{formatInr(preview)}</dd>
              </div>
              <div>
                <dt className="text-caption text-muted-foreground">CESS ({previewCess.label})</dt>
                <dd className="tabular-nums text-foreground">{formatInr(previewCess.amount)}</dd>
              </div>
              <div>
                <dt className="text-caption text-muted-foreground">Total with CESS</dt>
                <dd className="tabular-nums text-foreground">{formatInr(preview + previewCess.amount)}</dd>
              </div>
            </dl>
            {when === "now" ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <SelectField id="al-mode" label="Paid by" required value={mode} onChange={(v) => setMode(v as PayMode)} options={modeOptions} />
                <TextField
                  id="al-received"
                  label="CESS received (₹)"
                  required
                  inputMode="decimal"
                  value={received}
                  onChange={setReceived}
                  error={lineTried ? lineErrors.received : undefined}
                  hint={received.trim() === "" ? "Full CESS" : undefined}
                  placeholder={preview > 0 ? String(previewCess.amount) : ""}
                  autoComplete="off"
                />
                <TextField
                  id="al-ref"
                  label={mode === "cash" ? "Reference" : "Payment reference"}
                  required={mode !== "cash"}
                  value={ref}
                  onChange={setRef}
                  error={lineTried ? lineErrors.ref : undefined}
                  hint={mode === "cash" ? "Optional" : "UPI id, cheque or transaction no"}
                  autoComplete="off"
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                The CESS stays pending against this trader. It will show as Pending in the allocations list.
              </p>
            )}
          </div>

          <div>
            <Button type="button" variant="outline" onClick={addLine} disabled={free.length === 0}>
              <PlusIcon aria-hidden="true" />
              Add trader
            </Button>
          </div>
          {triedStep === 3 && linesError && (
            <p role="alert" className="text-sm text-destructive">
              {linesError}
            </p>
          )}
        </section>
      )}

      {step === 4 && (
        <section aria-labelledby="al-s4" className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h2 id="al-s4" className="text-heading-md text-foreground">
              Check and save
            </h2>
            <p className="text-sm text-muted-foreground">Go back to a step to change anything.</p>
          </div>

          <div className="flex flex-wrap items-start gap-4 rounded-card border border-border p-4">
            {photo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="Photo of the truck's product" className="aspect-8/5 w-36 rounded-field border border-border object-cover" />
            )}
            <dl className="grid flex-1 grid-cols-2 gap-4">
              <Fact label="Product" value={product} />
              <Fact label="Unit" value={unit} />
              <Fact label="Supplier" value={supplier} />
              <Fact label="Origin" value={origin} />
              <Fact label="Challan or invoice" value={challan} />
              <Fact label="Net weight at bridge" value={bridge.net !== null ? `${kgFmt.format(bridge.net)} kg` : "Not weighed"} />
            </dl>
          </div>

          <div className="overflow-x-auto rounded-card border border-border">
            <table className="w-full min-w-[560px] text-[15px]">
              <caption className="sr-only">Allocations to save</caption>
              <thead>
                <tr className="h-10 border-b border-border text-left text-caption text-muted-foreground">
                  <th scope="col" className="pl-4 font-normal">Trader</th>
                  <th scope="col" className="text-right font-normal">Quantity</th>
                  <th scope="col" className="text-right font-normal">Rate</th>
                  <th scope="col" className="text-right font-normal">Amount</th>
                  <th scope="col" className="text-right font-normal">CESS</th>
                  <th scope="col" className="pr-4 text-right font-normal">CESS received</th>
                </tr>
              </thead>
              <tbody>
                {draft.map((d) => {
                  const amount = lineAmount(d);
                  return (
                    <tr key={d.key} className="h-12 border-b border-border">
                      <th scope="row" className="pl-4 text-left font-normal">
                        {d.partyName}
                        <span className="block text-caption text-muted-foreground">Bill {d.billNo}</span>
                      </th>
                      <td className="text-right tabular-nums">{formatQty(d.qty)} {unit}</td>
                      <td className="text-right tabular-nums">{formatInr(d.rate)}</td>
                      <td className="text-right tabular-nums">{formatInr(amount)}</td>
                      <td className="text-right tabular-nums">{formatInr(cessFor(cfg, amount).amount)}</td>
                      <td className="pr-4 text-right tabular-nums">
                        {d.received > 0 ? formatInr(d.received) : "Pending"}
                        {d.mode && <span className="block text-caption text-muted-foreground">{payModes.find((m) => m.value === d.mode)?.label}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="h-12 text-foreground">
                  <th scope="row" className="pl-4 text-left font-normal">Total ({draft.length} {draft.length === 1 ? "trader" : "traders"})</th>
                  <td className="text-right tabular-nums">{formatQty(totals.qty)} {unit}</td>
                  <td />
                  <td className="text-right tabular-nums">{formatInr(totals.amount)}</td>
                  <td className="text-right text-[17px] tabular-nums">{formatInr(totals.cess)}</td>
                  <td className="pr-4 text-right tabular-nums">{formatInr(totals.paid)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <dl className="grid grid-cols-2 gap-4 rounded-card bg-muted p-4 sm:grid-cols-4">
            <div>
              <dt className="text-caption text-muted-foreground">CESS due</dt>
              <dd className="text-heading-md tabular-nums text-foreground">{formatInr(totals.cess)}</dd>
            </div>
            <div>
              <dt className="text-caption text-muted-foreground">CESS received now</dt>
              <dd className="text-heading-md tabular-nums text-foreground">{formatInr(totals.paid)}</dd>
            </div>
            <div>
              <dt className="text-caption text-muted-foreground">CESS pending</dt>
              <dd className="text-heading-md tabular-nums text-foreground">{formatInr(Math.max(0, totals.cess - totals.paid))}</dd>
            </div>
            <div>
              <dt className="text-caption text-muted-foreground">Goods value plus CESS</dt>
              <dd className="text-heading-md tabular-nums text-foreground">{formatInr(totals.amount + totals.cess)}</dd>
            </div>
          </dl>

          {failure && (
            <p role="alert" className="text-sm text-destructive">
              {failure}
            </p>
          )}
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
        <Button variant="ghost" size="lg" onClick={() => onStep(step - 1)} disabled={saving}>
          <ArrowLeftIcon aria-hidden="true" />
          Back
        </Button>
        {step < 4 ? (
          <Button size="lg" onClick={next}>
            Next
            <ArrowRightIcon aria-hidden="true" />
          </Button>
        ) : (
          <Button size="lg" onClick={save} disabled={saving} aria-busy={saving}>
            {saving && <Spinner />}
            {saving ? "Saving" : draft.length > 1 ? `Save ${draft.length} allocations` : "Save allocation"}
          </Button>
        )}
      </div>

      <PhotoDialog
        open={camOpen}
        title="Product photo"
        hint="Take a photo of the goods on the truck."
        onClose={() => setCamOpen(false)}
        onUse={(img) => {
          setPhoto(img);
          setCamOpen(false);
        }}
      />
    </div>
  );
}

export function AllocatePage() {
  const { user } = useAuth();
  const toast = useToast();
  const agent = user?.name ?? "Agent";
  const scanRef = useRef<HTMLInputElement>(null);

  const [view, setView] = useState<View>("allocate");
  const [step, setStep] = useState(1);
  const [code, setCode] = useState("");
  const [looking, setLooking] = useState(false);
  const [result, setResult] = useState<ScanLookup | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);

  const inside = useLiveQuery("al-inside", (a) => getInside({ forceError: a === 0 && forcedErrors().has("inside") }));
  const list = useLiveQuery("al-list", (a) => getAllocations({ forceError: a === 0 && forcedErrors().has("allocations") }));
  const insideList = inside.status === "ready" ? inside.data : [];
  const rows = list.status === "ready" ? list.data : [];

  const run = async (raw: string) => {
    if (!raw.trim() || looking) return;
    setLooking(true);
    setResult(null);
    const found = await lookupScan(raw);
    setLooking(false);
    setResult(found);
    setCode("");
    if (found.kind !== "none") setStep(2);
  };

  useEffect(() => {
    const t = setTimeout(() => scanRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  const scanAnother = () => {
    setResult(null);
    setCode("");
    setStep(1);
    setView("allocate");
    setTimeout(() => scanRef.current?.focus(), 60);
  };
  useHotkey("/", () => {
    if (step === 1) {
      setView("allocate");
      setTimeout(() => scanRef.current?.focus(), 60);
    }
  });

  const demoScan = () => {
    const pick = [...insideList].sort((a, b) => b.entryAt! - a.entryAt!)[0];
    if (pick) void run(qrPayload(pick));
  };

  const goStep = (n: number) => {
    if (n < 1) return;
    if (n === 1) {
      scanAnother();
      return;
    }
    setStep(n);
  };

  const onSaved = (made: Allocation[]) => {
    const first = made[0];
    const cess = made.reduce((s, a) => s + a.cess, 0);
    toast.push(`${made.length} ${made.length === 1 ? "allocation" : "allocations"} saved for ${first.plate || "the truck"}. CESS ${formatInr(cess)}.`);
    setHighlight(first.id);
    setTimeout(() => setHighlight((h) => (h === first.id ? null : h)), 3000);
    setView("list");
    setResult(null);
    setStep(1);
  };

  const m = result && result.kind !== "none" ? result.movement : null;
  const dayStart = new Date().setHours(0, 0, 0, 0);
  const today = rows.filter((a) => a.at >= dayStart);
  const todayCess = today.reduce((s, a) => s + a.cess, 0);
  const todayValue = today.reduce((s, a) => s + a.amount, 0);

  return (
    <div className="flex flex-col gap-8 lg:gap-10">
      <PageHeader
        title="Allocate to Traders"
        description="Scan the truck, photograph its product, then split the goods between traders. CESS is worked out for you."
        actions={
          <Segmented
            label="Allocation view"
            value={view}
            onChange={(v) => (v === "allocate" ? scanAnother() : setView("list"))}
            options={[
              { value: "allocate", label: "Allocate" },
              { value: "list", label: list.status === "ready" ? `Allocations (${rows.length})` : "Allocations" },
            ]}
          />
        }
      />

      <div hidden={view !== "allocate"} className="mx-auto flex w-full max-w-220 animate-in flex-col gap-6 fade-in slide-in-from-bottom-2 duration-300">
        <Card className="gap-0 p-0 [--card-spacing:--spacing(6)]">
          <div className="p-6">
            <Stepper step={step} onGo={goStep} />
          </div>
        </Card>

        <Card className="gap-0 p-0 [--card-spacing:--spacing(6)]">
          <div className="flex flex-col gap-6 p-6">
            {step === 1 && (
              <>
                <div className="flex flex-col gap-1">
                  <h2 className="text-heading-md text-foreground">Scan the truck</h2>
                  <p className="text-sm text-muted-foreground">Scan the entry QR code, or type the entry number, plate or FASTag.</p>
                </div>
                <QrScanner onScan={(text) => void run(text)} disabled={looking} />
                <form
                  className="flex flex-col gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(code);
                  }}
                >
                  <label htmlFor="al-scan" className="text-sm text-foreground">
                    Scanner field
                  </label>
                  <div className="relative">
                    <ScanLineIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="al-scan"
                      ref={scanRef}
                      data-page-search
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="Scan with the handheld scanner, or type the entry number or plate"
                      title="Scan (/)"
                      aria-keyshortcuts="/"
                      className="h-12 pr-12 pl-10"
                    />
                    {looking && <Spinner className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground" />}
                  </div>
                  <p className="text-caption text-muted-foreground">A handheld scanner types the code here and presses Enter.</p>
                </form>

                {looking && (
                  <div role="status" aria-label="Looking up the truck" className="flex flex-col gap-3">
                    <Skeleton className="h-6 w-48" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                )}

                {result?.kind === "none" && (
                  <div role="status" className="flex items-start gap-2 rounded-card border border-border bg-muted p-4 text-[15px] text-foreground">
                    <InfoIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
                    No truck found for {result.code}. Check the code and scan again.
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
                  <Button type="button" variant="ghost" onClick={demoScan} disabled={looking || insideList.length === 0}>
                    <QrCodeIcon aria-hidden="true" />
                    Demo: scan a vehicle that is inside
                  </Button>
                </div>
              </>
            )}

            {step > 1 && m && <TruckSteps key={m.id} movement={m} agent={agent} step={step} onStep={goStep} onSaved={onSaved} />}
          </div>
        </Card>
      </div>

      {view === "list" && (
        <Card className="animate-in gap-4 fade-in slide-in-from-bottom-2 duration-300">
          <CardHeader>
            <CardTitle className="text-heading-md">Allocations</CardTitle>
            <CardDescription>
              {list.status === "ready"
                ? `Today ${today.length} allocations · goods ${formatInr(todayValue)} · CESS collected ${formatInr(todayCess)}`
                : "Latest first"}
            </CardDescription>
          </CardHeader>
          <div className="px-(--card-spacing)">
            {list.status === "loading" && (
              <div className={BODY} role="status" aria-label="Loading allocations">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex h-14 items-center gap-4">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                ))}
              </div>
            )}
            {list.status === "error" && <BlockError onRetry={list.retry} className={BODY} />}
            {list.status === "ready" && rows.length === 0 && (
              <BlockEmpty icon={SplitIcon} text="No allocations yet." actionLabel="Scan a truck" onAction={scanAnother} className={BODY} />
            )}
            {list.status === "ready" && rows.length > 0 && (
              <DataTable
                id="al"
                caption="Allocations to traders"
                columns={columns}
                rows={rows}
                rowKey={(a) => a.id}
                highlightId={highlight}
                pageSize={10}
                minWidth={900}
                actionLabel={(a) => `Actions for ${a.no}`}
                actions={(a) => [{ label: "View", icon: EyeIcon, onSelect: () => setOpenId(a.id) }]}
              />
            )}
          </div>
        </Card>
      )}

      <AllocationDialog id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
