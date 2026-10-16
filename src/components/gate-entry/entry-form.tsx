"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { SelectField } from "@/components/ui/select-field";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { FormBanner } from "@/components/auth/form-banner";
import { TextField } from "@/components/auth/text-field";
import { submitEntry, suggestionsFor } from "@/lib/api/gate";
import { checkEntry, normalizeId, useStoreVersion } from "@/lib/domain/store";
import {
  type EntryInput,
  type Movement,
  type Purpose,
  type VehicleType,
} from "@/lib/domain/types";
import { activeGate } from "@/lib/domain/settings";
import { formatStamp } from "@/lib/format";
import { useNow } from "@/hooks/use-now";
import { activeLabels } from "@/lib/domain/admin-store";

type Mode = "plate" | "fastag" | "both";

type Form = {
  mode: Mode;
  plate: string;
  plateOverride: boolean;
  fastag: string;
  noFastag: boolean;
  vehicleClass: string;
  bank: string;
  driverName: string;
  driverPhone: string;
  vehicleType: VehicleType;
  transporter: string;
  purpose: Purpose | "";
  reference: string;
  remarks: string;
};

const INITIAL: Form = {
  mode: "both",
  plate: "",
  plateOverride: false,
  fastag: "",
  noFastag: false,
  vehicleClass: "",
  bank: "",
  driverName: "",
  driverPhone: "",
  vehicleType: "Truck",
  transporter: "",
  purpose: "",
  reference: "",
  remarks: "",
};

const PLATE_RE = /^[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{4}$/;
const modes = [
  { value: "plate", label: "Plate only" },
  { value: "fastag", label: "FASTag only" },
  { value: "both", label: "Both" },
] as const;
const classOptions = [
  { value: "", label: "Select class" },
  { value: "Class 4 · Truck (2 axle)", label: "Class 4 · Truck (2 axle)" },
  { value: "Class 5 · Truck (3 axle)", label: "Class 5 · Truck (3 axle)" },
  { value: "Class 6 · Truck (4-6 axle)", label: "Class 6 · Truck (4-6 axle)" },
  { value: "Class 7 · Truck (7+ axle)", label: "Class 7 · Truck (7+ axle)" },
];
const bankOptions = [
  { value: "", label: "Select bank (optional)" },
  ...["HDFC Bank", "ICICI Bank", "SBI", "Axis Bank", "IDFC FIRST Bank", "Paytm Payments Bank", "Other"].map(
    (b) => ({ value: b, label: b })
  ),
];
const typeOptions = () => activeLabels("vehicleTypes").map((t) => ({ value: t, label: t }));
const purposeOptions = () => [
  { value: "", label: "Select purpose" },
  ...activeLabels("purposes").map((p) => ({ value: p, label: p })),
];

const NAV_ORDER = [
  "ge-plate",
  "ge-fastag",
  "ge-nofastag",
  "ge-class",
  "ge-bank",
  "ge-driver",
  "ge-phone",
  "ge-vtype",
  "ge-transporter",
  "ge-purpose",
  "ge-ref",
  "ge-remarks",
];

const stamp = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "medium" });

function phoneDigits(v: string) {
  let d = v.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  return d;
}

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
  const [serverError, setServerError] = useState(false);
  const [blocked, setBlocked] = useState<{ kind: "duplicate" | "conflict"; movement: Movement } | null>(null);
  const set = (patch: Partial<Form>) => setF((p) => ({ ...p, ...patch }));

  const focusFirst = (mode: Mode) =>
    requestAnimationFrame(() => document.getElementById(mode === "fastag" ? "ge-fastag" : "ge-plate")?.focus());

  useEffect(() => {
    focusFirst("both");
  }, []);

  const plateOn = f.mode !== "fastag";
  const tagOn = f.mode !== "plate";
  const tagRequired = tagOn && !f.noFastag;
  const plateId = normalizeId(f.plate);
  const plateNonStandard = plateOn && !!plateId && !PLATE_RE.test(plateId) && !f.plateOverride;

  const errors: Partial<Record<string, string>> = {};
  if (plateOn && !plateId) errors.plate = "Enter the plate number.";
  if (tagOn && tagRequired && !f.fastag.trim()) errors.fastag = "Scan or enter the FASTag ID.";
  if (!f.driverName.trim()) errors.driver = "Enter the driver name.";
  if (phoneDigits(f.driverPhone).length !== 10) errors.phone = "Enter a 10-digit phone number.";
  if (!f.purpose) errors.purpose = "Choose a purpose.";
  const valid = Object.keys(errors).length === 0;
  const shown = attempted ? errors : {};

  const live = plateId || f.fastag.trim() ? checkEntry(plateOn ? f.plate : "", tagOn ? f.fastag : "") : null;
  const suggestions =
    plateOn && plateId.length < 10 ? suggestionsFor(f.plate) : [];

  const pickSuggestion = (m: Movement) =>
    set({
      plate: m.plate,
      fastag: tagOn && !f.fastag ? m.fastag : f.fastag,
      driverName: f.driverName || m.driverName,
      driverPhone: f.driverPhone || m.driverPhone,
      vehicleType: m.vehicleType,
      transporter: f.transporter || m.transporter,
      vehicleClass: f.vehicleClass || m.vehicleClass,
      bank: f.bank || m.bank,
    });

  const submit = async () => {
    if (submitting) return;
    setAttempted(true);
    setServerError(false);
    if (!valid) {
      const firstId = [
        ["plate", "ge-plate"],
        ["fastag", "ge-fastag"],
        ["driver", "ge-driver"],
        ["phone", "ge-phone"],
        ["purpose", "ge-purpose"],
      ].find(([k]) => errors[k]);
      if (firstId) document.getElementById(firstId[1])?.focus();
      return;
    }
    setSubmitting(true);
    const input: EntryInput = {
      plate: plateOn ? f.plate : "",
      fastag: tagOn && !f.noFastag ? f.fastag : "",
      noFastag: tagOn ? f.noFastag : false,
      vehicleClass: tagOn ? f.vehicleClass : "",
      bank: tagOn ? f.bank : "",
      driverName: f.driverName.trim(),
      driverPhone: phoneDigits(f.driverPhone),
      vehicleType: f.vehicleType,
      transporter: f.transporter.trim(),
      purpose: f.purpose as Purpose,
      reference: f.reference.trim(),
      remarks: f.remarks.trim(),
    };
    try {
      const result = await submitEntry(input, operator);
      if (result.ok) {
        setBlocked(null);
        onSaved(result.movement);
        setF({ ...INITIAL, mode: f.mode });
        setAttempted(false);
        setTimeout(() => focusFirst(f.mode), 80);
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

        <Section title="Identification mode">
          <Segmented
            label="Identification mode"
            value={f.mode}
            options={modes}
            disabled={submitting}
            onChange={(mode) => {
              set({ mode });
              focusFirst(mode);
            }}
          />
        </Section>

        <Section
          title="Registration plate"
          hint={plateOn ? undefined : "Not needed in FASTag only mode."}
        >
          <TextField
            id="ge-plate"
            label="Plate number"
            required={plateOn}
            value={f.plate}
            onChange={(v) => set({ plate: v.toUpperCase(), plateOverride: false })}
            disabled={!plateOn || submitting}
            error={shown.plate}
            maxLength={14}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="MH12AB1234"
            hint={plateOn && !plateNonStandard ? "Example: MH12AB1234" : undefined}
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
          {suggestions.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-caption text-muted-foreground">Recent plates</p>
              <ul className="flex flex-wrap gap-2">
                {suggestions.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => pickSuggestion(m)}
                      className="inline-flex h-10 items-center rounded-full border border-border bg-background px-3 text-sm tabular-nums outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {m.plate}
                    </button>
                  </li>
                ))}
              </ul>
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

        <Section title="FASTag" hint={tagOn ? undefined : "Not needed in Plate only mode."}>
          <TextField
            id="ge-fastag"
            label="FASTag ID"
            required={tagOn && !f.noFastag}
            value={f.fastag}
            onChange={(v) => set({ fastag: v.toUpperCase() })}
            disabled={!tagOn || f.noFastag || submitting}
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
              disabled={!tagOn || submitting}
              onChange={(e) => set({ noFastag: e.target.checked, fastag: e.target.checked ? "" : f.fastag })}
              className="size-4 rounded-xs accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
            Vehicle has no FASTag
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              id="ge-class"
              label="Vehicle class"
              value={f.vehicleClass}
              onChange={(v) => set({ vehicleClass: v })}
              options={classOptions}
              disabled={!tagOn || submitting}
            />
            <SelectField
              id="ge-bank"
              label="Issuing bank"
              value={f.bank}
              onChange={(v) => set({ bank: v })}
              options={bankOptions}
              disabled={!tagOn || submitting}
            />
          </div>
        </Section>

        <Section title="Trip details">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id="ge-driver"
              label="Driver name"
              required
              value={f.driverName}
              onChange={(v) => set({ driverName: v })}
              error={shown.driver}
              autoComplete="off"
              disabled={submitting}
            />
            <TextField
              id="ge-phone"
              label="Driver phone"
              required
              type="tel"
              inputMode="tel"
              value={f.driverPhone}
              onChange={(v) => set({ driverPhone: v })}
              error={shown.phone}
              autoComplete="off"
              disabled={submitting}
              placeholder="10-digit mobile"
            />
            <SelectField
              id="ge-vtype"
              label="Vehicle type"
              value={f.vehicleType}
              onChange={(v) => set({ vehicleType: v as VehicleType })}
              options={typeOptions()}
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
              options={purposeOptions()}
              error={shown.purpose}
              disabled={submitting}
            />
            <TextField
              id="ge-ref"
              label="Reference number"
              value={f.reference}
              onChange={(v) => set({ reference: v })}
              autoComplete="off"
              disabled={submitting}
              hint="Optional"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="ge-remarks" className="text-sm text-foreground">
              Remarks
            </label>
            <Textarea
              id="ge-remarks"
              value={f.remarks}
              onChange={(e) => set({ remarks: e.target.value })}
              disabled={submitting}
              placeholder="Optional"
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
    </Card>
  );
}
