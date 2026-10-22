"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CameraIcon, WandSparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SelectField } from "@/components/ui/select-field";
import { Spinner } from "@/components/ui/spinner";
import { FormBanner } from "@/components/auth/form-banner";
import { TextField } from "@/components/auth/text-field";
import { simulateArrival, submitEntry, vehicleDetailsFor, type VehicleDetails } from "@/lib/api/gate";
import { CameraDialog, type CameraKind } from "@/components/gate-entry/camera-dialog";
import { checkEntry, normalizeId, useStoreVersion } from "@/lib/domain/store";
import { purposes, vehicleTypes, type EntryInput, type Movement, type Purpose } from "@/lib/domain/types";
import { activeGate } from "@/lib/domain/settings";
import { formatStamp } from "@/lib/format";
import { useNow } from "@/hooks/use-now";

type Form = {
  plate: string;
  plateOverride: boolean;
  fastag: string;
  noFastag: boolean;
  driverName: string;
  transporter: string;
  purpose: Purpose | "";
  /** Fetched details the operator has changed by hand. Cleared when the plate or FASTag changes. */
  edits: Partial<VehicleDetails>;
};

const INITIAL: Form = {
  plate: "",
  plateOverride: false,
  fastag: "",
  noFastag: false,
  driverName: "",
  transporter: "",
  purpose: "",
  edits: {},
};

const PLATE_RE = /^[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{4}$/;
const purposeOptions = [{ value: "", label: "Select purpose" }, ...purposes.map((p) => ({ value: p, label: p }))];

const typeOptions = vehicleTypes.map((t) => ({ value: t, label: t }));
const classList = ["Class 4 · Truck (2 axle)", "Class 5 · Truck (3 axle)", "Class 6 · Truck (4-6 axle)", "Class 7 · Truck (7+ axle)"];
const bankList = ["HDFC Bank", "ICICI Bank", "SBI", "Axis Bank", "IDFC FIRST Bank", "Paytm Payments Bank", "Other"];
const optionsWith = (list: string[], current: string) =>
  (current && !list.includes(current) ? [...list, current] : list).map((v) => ({ value: v, label: v }));

const NAV_ORDER = ["ge-plate", "ge-fastag", "ge-nofastag", "ge-vtype", "ge-class", "ge-bank", "ge-driver", "ge-transporter", "ge-purpose"];

const stamp = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "medium" });

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 border-b border-border pb-6 last:border-b-0 last:pb-0">
      <div className="flex flex-col gap-1">
        <h2 className="text-[17px] tracking-[-0.2px] text-foreground">{title}</h2>
        {hint && <p className="text-caption text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export function EntryForm({
  operator,
  onSaved,
}: {
  operator: string;
  onSaved: (m: Movement) => void;
}) {
  useStoreVersion();
  const now = useNow(1000);
  const [f, setF] = useState<Form>(INITIAL);
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [serverError, setServerError] = useState(false);
  const [cam, setCam] = useState<CameraKind | null>(null);
  const [shots, setShots] = useState<{ plate?: string; fastag?: string }>({});
  const [captureNote, setCaptureNote] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<{ kind: "duplicate" | "conflict"; movement: Movement } | null>(null);
  const set = (patch: Partial<Form>) =>
    setF((p) => ({ ...p, ...("plate" in patch || "fastag" in patch || "noFastag" in patch ? { edits: {} } : {}), ...patch }));

  const focusFirst = () => requestAnimationFrame(() => document.getElementById("ge-plate")?.focus());

  useEffect(() => {
    focusFirst();
  }, []);

  const plateId = normalizeId(f.plate);
  const plateNonStandard = !!plateId && !PLATE_RE.test(plateId) && !f.plateOverride;
  const fetched = vehicleDetailsFor({ plate: f.plate, fastag: f.noFastag ? "" : f.fastag });
  const details: VehicleDetails | null = fetched && { ...fetched, ...f.edits };
  const editDetail = (patch: Partial<VehicleDetails>) => setF((p) => ({ ...p, edits: { ...p.edits, ...patch } }));

  const errors: Partial<Record<string, string>> = {};
  if (!plateId) errors.plate = "Enter the plate number.";
  if (!f.noFastag && !f.fastag.trim()) errors.fastag = "Scan or enter the FASTag ID.";
  if (!f.driverName.trim()) errors.driver = "Enter the driver name.";
  if (!f.purpose) errors.purpose = "Choose a purpose.";
  const valid = Object.keys(errors).length === 0;
  const shown = attempted ? errors : {};

  const live = plateId || f.fastag.trim() ? checkEntry(f.plate, f.noFastag ? "" : f.fastag) : null;

  /** A camera result fills the plate or FASTag. The vehicle details are fetched from them. The driver is never copied. */
  const applyCapture = (kind: CameraKind, value: string, image: string) => {
    setCam(null);
    setShots((s) => ({ ...s, [kind]: image }));
    const text = value.toUpperCase();
    setF((p) => ({ ...p, ...(kind === "plate" ? { plate: text, plateOverride: false } : { fastag: text, noFastag: false }), edits: {} }));
    setCaptureNote(`${kind === "plate" ? "Plate" : "FASTag"} ${text} was read. Vehicle details were fetched. Enter the driver name.`);
    setTimeout(() => document.getElementById("ge-driver")?.focus(), 80);
  };

  /** Test helper: fills the plate and FASTag as if both cameras had read a truck. */
  const simulate = async () => {
    if (simulating || submitting) return;
    setSimulating(true);
    const r = await simulateArrival();
    setSimulating(false);
    setShots({});
    setF((p) => ({ ...p, plate: r.plate, plateOverride: false, fastag: r.fastag, noFastag: false, edits: {} }));
    setCaptureNote(`Simulated: plate ${r.plate} and FASTag ${r.fastag} were read. Vehicle details were fetched. Enter the driver name.`);
    setTimeout(() => document.getElementById("ge-driver")?.focus(), 80);
  };

  const submit = async () => {
    if (submitting) return;
    setAttempted(true);
    setServerError(false);
    if (!valid) {
      const firstId = [
        ["plate", "ge-plate"],
        ["fastag", "ge-fastag"],
        ["driver", "ge-driver"],
        ["purpose", "ge-purpose"],
      ].find(([k]) => errors[k]);
      if (firstId) document.getElementById(firstId[1])?.focus();
      return;
    }
    setSubmitting(true);
    const input: EntryInput = {
      plate: f.plate,
      fastag: f.noFastag ? "" : f.fastag,
      noFastag: f.noFastag,
      vehicleClass: details?.vehicleClass ?? "",
      bank: f.noFastag ? "" : (details?.bank ?? ""),
      driverName: f.driverName.trim(),
      driverPhone: "",
      vehicleType: details?.vehicleType ?? "Truck",
      transporter: f.transporter.trim(),
      purpose: f.purpose as Purpose,
      reference: "",
      remarks: "",
    };
    try {
      const result = await submitEntry(input, operator);
      if (result.ok) {
        setBlocked(null);
        onSaved(result.movement);
        setF(INITIAL);
        setShots({});
        setCaptureNote(null);
        setAttempted(false);
        setTimeout(focusFirst, 80);
      } else {
        setBlocked({ kind: result.code, movement: result.movement });
      }
    } catch {
      setServerError(true);
    }
    setSubmitting(false);
  };

  // Enter moves to the next field; Enter on the last required field saves.
  const onKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== "Enter") return;
    const el = e.target as HTMLElement;
    if (!["INPUT", "SELECT"].includes(el.tagName)) return;
    e.preventDefault();
    if (el.id === "ge-purpose") {
      void submit();
      return;
    }
    const enabled = NAV_ORDER.map((id) => document.getElementById(id) as HTMLInputElement | null).filter(
      (x): x is HTMLInputElement => !!x && !x.disabled
    );
    const i = enabled.findIndex((x) => x.id === el.id);
    enabled[Math.min(i + 1, enabled.length - 1)]?.focus();
  };

  const bannerMessage = serverError
    ? "We couldn't save this entry. Your details are still here. Try again."
    : blocked?.kind === "duplicate"
      ? `${blocked.movement.plate || "This vehicle"} is already inside since ${formatStamp(blocked.movement.entryAt!)}.`
      : blocked?.kind === "conflict"
        ? `This FASTag is linked to ${blocked.movement.plate}, which is still inside.`
        : null;

  return (
    <Card className="gap-0 p-0 [--card-spacing:--spacing(6)]">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        onKeyDown={onKeyDown}
        className="flex flex-col gap-6 p-6"
      >
        <FormBanner
          message={
            attempted && !valid && !bannerMessage
              ? "Fill the highlighted fields to save this entry."
              : bannerMessage
          }
          action={
            serverError ? (
              <Button type="button" variant="outline" onClick={() => void submit()} disabled={submitting}>
                Try again
              </Button>
            ) : blocked ? (
              <Link
                href={`/gate-exit?q=${encodeURIComponent(blocked.movement.plate || blocked.movement.fastag)}`}
                className="inline-flex min-h-10 items-center text-sm text-primary hover:underline"
              >
                Go to gate exit
              </Link>
            ) : undefined
          }
        />

        <Section
          title="Gate cameras"
          hint="Capture the number plate and the FASTag. The vehicle details fill in. The driver name is always typed."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <CameraTile
              title="Plate camera"
              valueLabel="Plate"
              value={f.plate}
              image={shots.plate}
              disabled={submitting}
              onCapture={() => setCam("plate")}
            />
            <CameraTile
              title="Front camera (FASTag)"
              valueLabel="FASTag"
              value={f.fastag}
              image={shots.fastag}
              disabled={f.noFastag || submitting}
              onCapture={() => setCam("fastag")}
            />
          </div>
          <div>
            <Button type="button" variant="ghost" onClick={() => void simulate()} disabled={simulating || submitting} aria-busy={simulating}>
              {simulating ? <Spinner /> : <WandSparklesIcon aria-hidden="true" />}
              Simulate
            </Button>
          </div>
          <FormBanner tone="info" message={captureNote} />
        </Section>

        <Section title="Registration plate">
          <TextField
            id="ge-plate"
            label="Plate number"
            required
            value={f.plate}
            onChange={(v) => set({ plate: v.toUpperCase(), plateOverride: false })}
            disabled={submitting}
            error={shown.plate}
            maxLength={14}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="MH12AB1234"
            hint={!plateNonStandard ? "Example: MH12AB1234" : undefined}
            className="[&_input]:h-14 [&_input]:text-xl [&_input]:tracking-wider"
          />
          {plateNonStandard && (
            <div className="flex flex-wrap items-center gap-3 rounded-field bg-muted px-3 py-2 text-sm">
              <span>This does not look like a standard plate.</span>
              <button
                type="button"
                onClick={() => set({ plateOverride: true })}
                className="inline-flex min-h-10 items-center rounded-full text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                Enter anyway
              </button>
            </div>
          )}
          {live && live.kind !== "ok" && !blocked && (
            <FormBanner
              tone="info"
              message={
                live.kind === "duplicate"
                  ? `${live.movement.plate || "This vehicle"} is already inside since ${formatStamp(live.movement.entryAt!)}. A second entry is blocked.`
                  : `This FASTag is linked to ${live.movement.plate}, which is still inside.`
              }
              action={
                <Link
                  href={`/gate-exit?q=${encodeURIComponent(live.movement.plate || live.movement.fastag)}`}
                  className="inline-flex min-h-10 items-center text-sm text-primary hover:underline"
                >
                  Go to gate exit
                </Link>
              }
            />
          )}
        </Section>

        <Section title="FASTag">
          <TextField
            id="ge-fastag"
            label="FASTag ID"
            required={!f.noFastag}
            value={f.fastag}
            onChange={(v) => set({ fastag: v.toUpperCase() })}
            disabled={f.noFastag || submitting}
            error={shown.fastag}
            autoComplete="off"
            spellCheck={false}
            placeholder="Scan or type the tag ID"
          />
          <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
            <input
              id="ge-nofastag"
              type="checkbox"
              checked={f.noFastag}
              disabled={submitting}
              onChange={(e) => set({ noFastag: e.target.checked, fastag: e.target.checked ? "" : f.fastag })}
              className="size-4 rounded-xs accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
            Vehicle has no FASTag
          </label>
        </Section>

        <Section title="Fetched automatically" hint="Looked up from the plate and FASTag. Change them if the lookup is wrong.">
          <div className="grid gap-4 sm:grid-cols-3">
            <SelectField
              id="ge-vtype"
              label="Vehicle type"
              value={details?.vehicleType ?? ""}
              onChange={(v) => editDetail({ vehicleType: v as VehicleDetails["vehicleType"] })}
              options={details ? typeOptions : [{ value: "", label: "—" }]}
              disabled={!details || submitting}
            />
            <SelectField
              id="ge-class"
              label="Vehicle class"
              value={details?.vehicleClass ?? ""}
              onChange={(v) => editDetail({ vehicleClass: v })}
              options={details ? optionsWith(classList, details.vehicleClass) : [{ value: "", label: "—" }]}
              disabled={!details || submitting}
            />
            <SelectField
              id="ge-bank"
              label="Issuing bank"
              value={f.noFastag ? "" : (details?.bank ?? "")}
              onChange={(v) => editDetail({ bank: v })}
              options={details && !f.noFastag ? optionsWith(bankList, details.bank) : [{ value: "", label: f.noFastag ? "No FASTag" : "—" }]}
              disabled={!details || f.noFastag || submitting}
            />
          </div>
        </Section>

        <Section title="Trip details">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id="ge-driver"
              label="Driver name"
              required
              hint="Required. Ask the driver."
              value={f.driverName}
              onChange={(v) => set({ driverName: v })}
              error={shown.driver}
              autoComplete="off"
              disabled={submitting}
            />
            <TextField
              id="ge-transporter"
              label="Transporter / company"
              value={f.transporter}
              onChange={(v) => set({ transporter: v })}
              autoComplete="off"
              disabled={submitting}
            />
            <SelectField
              id="ge-purpose"
              label="Purpose"
              required
              value={f.purpose}
              onChange={(v) => set({ purpose: v as Purpose })}
              options={purposeOptions}
              error={shown.purpose}
              disabled={submitting}
            />
          </div>
        </Section>

        <Section title="Captured automatically" hint="These are filled in by the system and cannot be edited.">
          <dl className="grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-caption text-muted-foreground">Entry time</dt>
              <dd className="text-[15px] tabular-nums text-foreground">{now ? stamp.format(now) : "—"}</dd>
            </div>
            <div>
              <dt className="text-caption text-muted-foreground">Operator</dt>
              <dd className="text-[15px] text-foreground">{operator}</dd>
            </div>
            <div>
              <dt className="text-caption text-muted-foreground">Gate</dt>
              <dd className="text-[15px] text-foreground">{activeGate()}</dd>
            </div>
          </dl>
        </Section>

        <Button
          type="submit"
          size="lg"
          className="w-full sm:w-auto sm:self-end"
          disabled={!valid || submitting}
          aria-busy={submitting}
        >
          {submitting && <Spinner />}
          {submitting ? "Saving" : "Save entry"}
        </Button>
      </form>
      <CameraDialog kind={cam} onClose={() => setCam(null)} onUse={applyCapture} />
    </Card>
  );
}

function CameraTile({
  title,
  valueLabel,
  value,
  image,
  disabled,
  onCapture,
}: {
  title: string;
  valueLabel: string;
  value: string;
  image?: string;
  disabled: boolean;
  onCapture: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-border p-4">
      <p className="text-[15px] text-foreground">{title}</p>
      <div className="flex aspect-8/5 items-center justify-center overflow-hidden rounded-field bg-muted">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={`${title} capture`} className="size-full object-cover" />
        ) : (
          <CameraIcon aria-hidden="true" className="size-8 text-muted-foreground" />
        )}
      </div>
      <p className="text-caption text-muted-foreground">{value ? `${valueLabel}: ${value}` : "Nothing captured yet"}</p>
      <Button type="button" variant="outline" onClick={onCapture} disabled={disabled}>
        <CameraIcon aria-hidden="true" />
        Capture
      </Button>
    </div>
  );
}
