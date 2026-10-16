"use client";

import { useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SelectField } from "@/components/ui/select-field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { FormBanner } from "@/components/auth/form-banner";
import { TextField } from "@/components/auth/text-field";
import { MatchChip } from "@/components/agent/pills";
import { recentItems, submitReceipt, type PickerVehicle } from "@/lib/api/agent";
import { toNum } from "@/lib/domain/agent-math";
import { MAX_RECEIPT_LINES, units, type Receipt, type Unit } from "@/lib/domain/agent-types";
import { listSellers } from "@/lib/api/agent";
import { useStoreVersion } from "@/lib/domain/store";
import { activeGate } from "@/lib/domain/settings";
import { formatStamp } from "@/lib/format";
import { useNow } from "@/hooks/use-now";

type LineForm = {
  key: number;
  item: string;
  unit: Unit | "";
  expected: string;
  actual: string;
  wastage: string;
  remark: string;
};

let lineKey = 0;
const blankLine = (): LineForm => ({ key: ++lineKey, item: "", unit: "", expected: "", actual: "", wastage: "", remark: "" });

const unitOptions = [{ value: "", label: "Unit" }, ...units.map((u) => ({ value: u, label: u }))];

type LineErrors = { item?: string; unit?: string; expected?: string; actual?: string; wastage?: string };

function validateLine(l: LineForm): LineErrors {
  const e: LineErrors = {};
  if (!l.item.trim()) e.item = "Enter the item.";
  if (!l.unit) e.unit = "Choose a unit.";
  const actual = toNum(l.actual);
  if (Number.isNaN(actual) || actual <= 0) e.actual = "Enter the quantity received.";
  if (l.expected.trim()) {
    const x = toNum(l.expected);
    if (Number.isNaN(x) || x < 0) e.expected = "Enter a valid quantity.";
  }
  if (l.wastage.trim()) {
    const w = toNum(l.wastage);
    if (Number.isNaN(w) || w < 0) e.wastage = "Enter a valid quantity.";
    else if (!Number.isNaN(actual) && w > actual) e.wastage = "More than received.";
  }
  return e;
}

const isMismatch = (l: LineForm) => {
  if (!l.expected.trim()) return false;
  const x = toNum(l.expected);
  const a = toNum(l.actual);
  return !Number.isNaN(x) && !Number.isNaN(a) && x !== a;
};

export function ReceiptForm({
  vehicle,
  agent,
  onSaved,
  onOpenReceipt,
}: {
  vehicle: PickerVehicle | null;
  agent: string;
  onSaved: (r: Receipt) => void;
  onOpenReceipt: (id: string) => void;
}) {
  useStoreVersion();
  const now = useNow(1000);
  const [lines, setLines] = useState<LineForm[]>(() => [blankLine()]);
  const [sellerId, setSellerId] = useState("");
  const [remark, setRemark] = useState("");
  const [flagOk, setFlagOk] = useState(false);
  const [flagReason, setFlagReason] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState(false);
  const [exists, setExists] = useState<Receipt | null>(null);

  const sellers = listSellers();
  const m = vehicle?.movement;
  const flagged = m?.status === "Flagged";
  const needsFlagConfirm = !!flagged && (!flagOk || !flagReason.trim());
  const errors = lines.map(validateLine);
  const linesValid = lines.length >= 1 && errors.every((e) => Object.keys(e).length === 0);
  const valid = !!vehicle && !vehicle.receipt && linesValid && !needsFlagConfirm;
  const mismatchCount = lines.filter(isMismatch).length;
  const suggestions = recentItems();

  const setLine = (key: number, patch: Partial<LineForm>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const reset = () => {
    setLines([blankLine()]);
    setSellerId("");
    setRemark("");
    setFlagOk(false);
    setFlagReason("");
    setAttempted(false);
    setConfirming(false);
    setExists(null);
    setServerError(false);
  };

  const doSave = async () => {
    if (!vehicle || submitting) return;
    setSubmitting(true);
    setServerError(false);
    try {
      const result = await submitReceipt(
        {
          movementId: vehicle.movement.id,
          sellerId,
          remark: remark.trim(),
          flaggedReason: flagged ? flagReason.trim() : undefined,
          lines: lines.map((l) => ({
            item: l.item.trim(),
            unit: l.unit as Unit,
            expected: l.expected.trim() ? toNum(l.expected) : null,
            actual: toNum(l.actual),
            wastage: l.wastage.trim() ? toNum(l.wastage) : 0,
            wastageRemark: l.remark.trim(),
          })),
        },
        agent
      );
      if (result.ok) {
        onSaved(result.receipt);
        reset();
      } else if (result.code === "exists") {
        setExists(result.receipt);
        setConfirming(false);
      }
    } catch {
      setServerError(true);
      setConfirming(false);
    }
    setSubmitting(false);
  };

  const onSave = () => {
    setAttempted(true);
    if (!valid) return;
    if (mismatchCount > 0) {
      setConfirming(true);
      return;
    }
    void doSave();
  };

  const disabled = !vehicle || submitting;

  return (
    <Card className="gap-0 p-0 [--card-spacing:--spacing(6)]">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
        className="flex flex-col gap-6 p-6"
      >
        <FormBanner
          message={
            serverError
              ? "We couldn't save this receipt. Your details are still here. Try again."
              : exists
                ? `A receipt already exists for this vehicle (${exists.no}).`
                : attempted && !valid && vehicle
                  ? "Fill the highlighted fields to save this receipt."
                  : null
          }
          action={
            serverError ? (
              <Button type="button" variant="outline" onClick={() => void doSave()} disabled={submitting}>
                Try again
              </Button>
            ) : exists ? (
              <button type="button" onClick={() => onOpenReceipt(exists.id)} className="inline-flex min-h-10 items-center text-sm text-primary hover:underline">
                Open receipt
              </button>
            ) : undefined
          }
        />

        <section className="flex flex-col gap-4 border-b border-border pb-6">
          <h2 className="text-[17px] tracking-[-0.2px] text-foreground">2. Vehicle</h2>
          {m ? (
            <dl className="grid gap-4 sm:grid-cols-2">
              <Item label="Plate" value={m.plate || m.fastag} />
              <Item label="Driver" value={m.driverName} />
              <Item label="Gate entry" value={m.entryAt ? formatStamp(m.entryAt) : "—"} />
              <Item label="Transporter" value={m.transporter} />
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">Pick a vehicle from the list to start.</p>
          )}
          {vehicle?.receipt && (
            <p className="text-sm text-foreground">
              Receipt already exists.{" "}
              <button type="button" className="text-primary hover:underline" onClick={() => onOpenReceipt(vehicle.receipt!.id)}>
                Open receipt
              </button>
            </p>
          )}
          {flagged && (
            <div className="flex flex-col gap-3 rounded-field bg-muted p-4">
              <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={flagOk} onChange={(e) => setFlagOk(e.target.checked)} className="size-4 rounded-xs accent-primary" />
                Vehicle is flagged. Record receipt anyway.
              </label>
              <TextField id="rc-flag" label="Reason" required value={flagReason} onChange={setFlagReason} disabled={!flagOk} error={attempted && flagOk && !flagReason.trim() ? "Enter a reason." : undefined} />
            </div>
          )}
          <SelectField
            id="rc-seller"
            label="Goods owner (seller)"
            value={sellerId}
            onChange={setSellerId}
            disabled={disabled}
            hint="Used to work out what you owe the seller."
            options={[{ value: "", label: "Not set" }, ...sellers.map((s) => ({ value: s.id, label: s.name }))]}
          />
        </section>

        <section className="flex flex-col gap-4 border-b border-border pb-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-[17px] tracking-[-0.2px] text-foreground">3. Goods</h2>
            <p className="text-caption text-muted-foreground">
              One line per item. Mixed loads need more than one line. Quantities only; money comes in Sales.
            </p>
          </div>
          <datalist id="rc-items">
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <ul className="flex flex-col gap-4">
            {lines.map((l, i) => {
              const e = attempted ? errors[i] : {};
              return (
                <li key={l.key} className="flex flex-col gap-4 rounded-card border border-border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="flex items-center gap-2 text-sm text-foreground">
                      Line {i + 1}
                      <MatchChip expected={l.expected.trim() ? toNum(l.expected) : null} actual={l.actual.trim() ? toNum(l.actual) : null} />
                    </p>
                    {lines.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Remove line ${i + 1}`}
                        onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                        disabled={submitting}
                      >
                        <Trash2Icon aria-hidden="true" />
                        Remove
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField
                      id={`rc-item-${l.key}`}
                      label="Item"
                      required
                      list="rc-items"
                      value={l.item}
                      onChange={(v) => setLine(l.key, { item: v })}
                      error={e.item}
                      disabled={disabled}
                      autoComplete="off"
                    />
                    <SelectField
                      id={`rc-unit-${l.key}`}
                      label="Unit"
                      required
                      value={l.unit}
                      onChange={(v) => setLine(l.key, { unit: v as Unit })}
                      options={unitOptions}
                      error={e.unit}
                      disabled={disabled}
                    />
                    <TextField
                      id={`rc-exp-${l.key}`}
                      label="Expected (challan)"
                      inputMode="decimal"
                      value={l.expected}
                      onChange={(v) => setLine(l.key, { expected: v })}
                      error={e.expected}
                      disabled={disabled}
                      autoComplete="off"
                    />
                    <TextField
                      id={`rc-act-${l.key}`}
                      label="Received (actual)"
                      required
                      inputMode="decimal"
                      value={l.actual}
                      onChange={(v) => setLine(l.key, { actual: v })}
                      error={e.actual}
                      disabled={disabled}
                      autoComplete="off"
                    />
                    <TextField
                      id={`rc-wst-${l.key}`}
                      label="Damage / wastage"
                      inputMode="decimal"
                      value={l.wastage}
                      onChange={(v) => setLine(l.key, { wastage: v })}
                      error={e.wastage}
                      disabled={disabled}
                      autoComplete="off"
                      hint="Optional"
                    />
                    <TextField
                      id={`rc-wrm-${l.key}`}
                      label="Wastage remark"
                      value={l.remark}
                      onChange={(v) => setLine(l.key, { remark: v })}
                      disabled={disabled}
                      autoComplete="off"
                      hint="Optional"
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setLines((ls) => [...ls, blankLine()])}
              disabled={disabled || lines.length >= MAX_RECEIPT_LINES}
            >
              <PlusIcon aria-hidden="true" />
              Add line
            </Button>
            {lines.length >= MAX_RECEIPT_LINES && (
              <p className="text-caption text-muted-foreground">That is the most lines one receipt can hold. Save it, then receive the rest on a new receipt.</p>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-2 border-b border-border pb-6">
          <label htmlFor="rc-remark" className="text-[17px] tracking-[-0.2px] text-foreground">
            Receipt remark
          </label>
          <Textarea id="rc-remark" value={remark} onChange={(e) => setRemark(e.target.value)} disabled={disabled} placeholder="Optional" />
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-[17px] tracking-[-0.2px] text-foreground">Captured automatically</h2>
            <p className="text-caption text-muted-foreground">Filled in by the system and cannot be edited.</p>
          </div>
          <dl className="grid gap-4 sm:grid-cols-3">
            <Item label="Receipt time" value={now ? formatStamp(now) : "—"} />
            <Item label="Agent" value={agent} />
            <Item label="Gate" value={activeGate()} />
          </dl>
        </section>

        {confirming ? (
          <div role="alertdialog" aria-labelledby="rc-confirm" className="flex flex-col gap-4 rounded-card border border-destructive/50 bg-destructive/5 p-5">
            <p id="rc-confirm" className="text-[15px] text-foreground">
              {mismatchCount} {mismatchCount === 1 ? "line differs" : "lines differ"} from expected. Save with mismatch flag?
            </p>
            <div className="flex flex-wrap gap-3">
              <Button type="button" onClick={() => void doSave()} disabled={submitting} aria-busy={submitting}>
                {submitting && <Spinner />}
                Save with flag
              </Button>
              <Button type="button" variant="outline" onClick={() => setConfirming(false)} disabled={submitting}>
                Go back
              </Button>
            </div>
          </div>
        ) : (
          <Button type="submit" size="lg" className="w-full sm:w-auto sm:self-end" disabled={!valid || submitting} aria-busy={submitting}>
            {submitting && <Spinner />}
            {submitting ? "Saving" : "Save receipt"}
          </Button>
        )}
      </form>
    </Card>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="text-[15px] break-words tabular-nums text-foreground">{value || "—"}</dd>
    </div>
  );
}

