"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { Textarea } from "@/components/ui/textarea";
import { TextField } from "@/components/auth/text-field";
import { FormBanner } from "@/components/auth/form-banner";
import { registeredVehicle } from "@/lib/domain/role-profiles";
import { units, type Unit } from "@/lib/domain/agent-types";
import type { Dispatch, DispatchInput } from "@/lib/domain/dispatch-store";
import type { SupplierRecord } from "@/lib/domain/admin-types";
import { normalizeId } from "@/lib/domain/store";

const OTHER = "__other";
const PLATE_RE = /^[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{4}$/;
const PHONE_RE = /^[6-9]\d{9}$/;

/**
 * The supplier's "this truck is coming" form: pick one of the registered
 * vehicles or type any number, then driver, goods, quantity and cost.
 */
export function DispatchForm({
  supplier,
  initial,
  submitLabel = "Save dispatch",
  busy = false,
  problem,
  onSubmit,
  onCancel,
}: {
  supplier: SupplierRecord;
  initial?: Dispatch;
  submitLabel?: string;
  busy?: boolean;
  problem?: string | null;
  onSubmit: (input: DispatchInput) => void;
  onCancel: () => void;
}) {
  const known = supplier.plates;
  const startPlate = initial?.plate ?? "";
  const startKnown = known.find((p) => normalizeId(p) === normalizeId(startPlate));
  const [pick, setPick] = useState<string>(initial ? (startKnown ?? OTHER) : known.length ? "" : OTHER);
  const [typed, setTyped] = useState(startKnown ? "" : startPlate);
  const [driverName, setDriverName] = useState(initial?.driverName ?? "");
  const [driverPhone, setDriverPhone] = useState(initial?.driverPhone ?? "");
  const [transporter, setTransporter] = useState(initial?.transporter ?? "");
  const [commodity, setCommodity] = useState(initial?.commodity ?? (supplier.commodities.length === 1 ? supplier.commodities[0] : ""));
  const [quantity, setQuantity] = useState(initial ? String(initial.quantity) : "");
  const [unit, setUnit] = useState<Unit>(initial?.unit ?? "bags");
  const [value, setValue] = useState(initial ? String(initial.value) : "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [attempted, setAttempted] = useState(false);
  const [filled, setFilled] = useState(false);

  const plate = normalizeId(pick === OTHER ? typed : pick);
  const qty = Number(quantity);
  const cost = Number(value);
  const errors = {
    plate: !pick ? "Select a vehicle or enter another number." : !PLATE_RE.test(plate) ? "Use a plate like MH12AB1234." : undefined,
    driverName: driverName.trim() ? undefined : "Enter the driver's name.",
    driverPhone: PHONE_RE.test(driverPhone.replace(/[\s-]/g, "")) ? undefined : "Enter a 10 digit mobile number.",
    commodity: commodity.trim() ? undefined : "Enter the goods being sent.",
    quantity: Number.isFinite(qty) && qty > 0 ? undefined : "Enter a quantity above zero.",
    value: value.trim() !== "" && Number.isFinite(cost) && cost >= 0 ? undefined : "Enter the cost of the goods.",
  };
  const valid = Object.values(errors).every((e) => !e);

  // A registered vehicle brings its usual driver along, but never overwrites what was typed.
  const fillFromVehicle = (p: string) => {
    const reg = registeredVehicle(p);
    if (!reg) return;
    if (!driverName.trim() && reg.driverName) {
      setDriverName(reg.driverName);
      setFilled(true);
    }
    if (!driverPhone.trim() && reg.driverPhone) setDriverPhone(reg.driverPhone);
    if (!transporter.trim() && reg.transporter) setTransporter(reg.transporter);
  };

  const submit = () => {
    setAttempted(true);
    if (!valid) return;
    onSubmit({
      supplierId: supplier.id,
      supplierName: supplier.name,
      plate,
      driverName,
      driverPhone,
      transporter,
      commodity,
      quantity: qty,
      unit,
      value: cost,
      notes,
    });
  };

  return (
    <form
      noValidate
      className="flex flex-col gap-8"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <FormBanner message={problem ?? (attempted && !valid ? "Fill the highlighted fields to continue." : null)} />

      <section className="flex flex-col gap-4">
        <h3 className="text-heading-md text-foreground">Vehicle</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id="dp-vehicle"
            label="Vehicle"
            required
            value={pick}
            onChange={(v) => {
              setPick(v);
              if (v && v !== OTHER) fillFromVehicle(v);
            }}
            options={[
              { value: "", label: "Select a vehicle" },
              ...known.map((p) => ({ value: p, label: p })),
              { value: OTHER, label: "Another vehicle (type the number)" },
            ]}
            error={attempted && pick !== OTHER ? errors.plate : undefined}
            hint={known.length ? undefined : "No vehicles registered yet. Type the number."}
          />
          {pick === OTHER && (
            <TextField
              id="dp-plate"
              label="Vehicle number plate"
              required
              value={typed}
              onChange={(v) => setTyped(v.toUpperCase())}
              onBlur={() => fillFromVehicle(typed)}
              placeholder="MH12AB1234"
              error={attempted ? errors.plate : undefined}
              autoComplete="off"
              spellCheck={false}
            />
          )}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h3 className="text-heading-md text-foreground">Driver</h3>
        {filled && <p className="text-sm text-muted-foreground">Filled from the registered driver. Change it if someone else is driving.</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField id="dp-driver" label="Driver name" required value={driverName} onChange={setDriverName} error={attempted ? errors.driverName : undefined} autoComplete="off" />
          <TextField id="dp-phone" label="Driver mobile number" required type="tel" inputMode="numeric" value={driverPhone} onChange={setDriverPhone} error={attempted ? errors.driverPhone : undefined} autoComplete="off" />
          <TextField id="dp-transporter" label="Transporter or owner" value={transporter} onChange={setTransporter} autoComplete="off" />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h3 className="text-heading-md text-foreground">Goods and cost</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="dp-commodity"
            label="Goods (commodity)"
            required
            list="dp-commodities"
            value={commodity}
            onChange={setCommodity}
            error={attempted ? errors.commodity : undefined}
            hint="Pick from your commodities or type another."
            autoComplete="off"
          />
          <datalist id="dp-commodities">
            {supplier.commodities.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <div className="grid grid-cols-2 gap-4">
            <TextField id="dp-qty" label="Quantity" required type="number" inputMode="decimal" min={0} value={quantity} onChange={setQuantity} error={attempted ? errors.quantity : undefined} autoComplete="off" />
            <SelectField id="dp-unit" label="Unit" value={unit} onChange={(v) => setUnit(v as Unit)} options={units.map((u) => ({ value: u, label: u }))} />
          </div>
          <TextField id="dp-value" label="Cost of the goods (₹)" required type="number" inputMode="decimal" min={0} value={value} onChange={setValue} error={attempted ? errors.value : undefined} hint="Total value being sent on this truck." autoComplete="off" />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="dp-notes" className="text-sm text-foreground">
            Notes
          </label>
          <Textarea id="dp-notes" name="dp-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </section>

      <div className="flex flex-wrap gap-3 sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" size="lg" disabled={busy} aria-busy={busy}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
