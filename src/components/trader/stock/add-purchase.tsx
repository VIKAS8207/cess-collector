"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { FormBanner } from "@/components/auth/form-banner";
import { TextField } from "@/components/auth/text-field";
import { SideDrawer } from "@/components/gate/side-drawer";
import { submitPurchase } from "@/lib/api/trader";
import { toNum } from "@/lib/domain/agent-math";
import { sellers } from "@/lib/domain/agent-store";
import { units, type Unit } from "@/lib/domain/agent-types";
import { parseDay, toDayInput } from "@/lib/domain/range";
import { formatInr } from "@/lib/format";
import { useNow } from "@/hooks/use-now";
import { activeLabels } from "@/lib/domain/admin-store";

const unitOptions = [{ value: "", label: "Select unit" }, ...units.map((u) => ({ value: u, label: u }))];

export function AddPurchaseDrawer({
  open,
  by,
  onClose,
  onSaved,
}: {
  open: boolean;
  by: string;
  onClose: () => void;
  onSaved: (id: string, label: string) => void;
}) {
  return (
    <SideDrawer open={open} onClose={onClose} title="Add manual purchase" description="Goods you bought outside the system.">
      {open && <Body by={by} onSaved={onSaved} />}
    </SideDrawer>
  );
}

function Body({ by, onSaved }: { by: string; onSaved: (id: string, label: string) => void }) {
  const nowMs = useNow(60_000);
  const [item, setItem] = useState("");
  const [unit, setUnit] = useState<Unit | "">("");
  const [qty, setQty] = useState("");
  const [rate, setRate] = useState("");
  const [seller, setSeller] = useState("");
  const [phone, setPhone] = useState("");
  const [date, setDate] = useState(() => toDayInput(Date.now()));
  const [remark, setRemark] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const q = toNum(qty);
  const r = toNum(rate);
  const errors = {
    item: item.trim() ? undefined : "Enter the item.",
    unit: unit ? undefined : "Choose a unit.",
    qty: Number.isNaN(q) || q <= 0 ? "Enter the quantity." : undefined,
    rate: Number.isNaN(r) || r <= 0 ? "Enter the purchase rate." : undefined,
    seller: seller.trim() ? undefined : "Enter the seller.",
    date: date ? undefined : "Choose a date.",
  };
  const valid = Object.values(errors).every((e) => !e);
  const total = !errors.qty && !errors.rate ? q * r : 0;
  const knownSellers = sellers().map((s) => s.name);
  const knownItems = activeLabels("items");

  const submit = async () => {
    setAttempted(true);
    setFailed(false);
    if (!valid || saving) return;
    setSaving(true);
    try {
      const day = parseDay(date);
      const when = day + (Date.now() - new Date().setHours(0, 0, 0, 0));
      const p = await submitPurchase(
        { item: item.trim(), unit: unit as Unit, qty: q, rate: r, seller: seller.trim(), phone: phone.trim(), date: Math.min(when, Date.now()), remark: remark.trim() },
        by
      );
      onSaved(p.id, `${q} ${unit} ${item.trim()}`);
    } catch {
      setFailed(true);
    }
    setSaving(false);
  };

  return (
    <form
      noValidate
      className="flex flex-col gap-8"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <FormBanner message={failed ? "We couldn't save this purchase. Try again." : attempted && !valid ? "Fill the highlighted fields to save this purchase." : null} />
      <section className="flex flex-col gap-4">
        <h3 className="text-heading-md text-foreground">Goods</h3>
        <datalist id="mp-items">
          {knownItems.map((i) => (
            <option key={i} value={i} />
          ))}
        </datalist>
        <TextField id="mp-item" label="Item" required list="mp-items" value={item} onChange={setItem} error={attempted ? errors.item : undefined} autoComplete="off" disabled={saving} />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField id="mp-unit" label="Unit" required value={unit} onChange={(v) => setUnit(v as Unit)} options={unitOptions} error={attempted ? errors.unit : undefined} disabled={saving} />
          <TextField id="mp-qty" label="Quantity" required inputMode="decimal" value={qty} onChange={setQty} error={attempted ? errors.qty : undefined} autoComplete="off" disabled={saving} />
        </div>
        <TextField id="mp-rate" label={`Purchase rate per ${unit ? (unit === "pieces" ? "piece" : unit.replace(/s$/, "")) : "unit"} (₹)`} required inputMode="decimal" value={rate} onChange={setRate} error={attempted ? errors.rate : undefined} hint={total ? `Purchase value ${formatInr(total)}` : undefined} autoComplete="off" disabled={saving} />
      </section>
      <section className="flex flex-col gap-4">
        <h3 className="text-heading-md text-foreground">Seller</h3>
        <datalist id="mp-sellers">
          {knownSellers.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <TextField id="mp-seller" label="Seller name" required list="mp-sellers" value={seller} onChange={setSeller} error={attempted ? errors.seller : undefined} autoComplete="off" disabled={saving} />
        <TextField id="mp-phone" label="Seller phone" type="tel" inputMode="tel" value={phone} onChange={setPhone} hint="Optional" autoComplete="off" disabled={saving} />
      </section>
      <section className="flex flex-col gap-4">
        <TextField id="mp-date" label="Purchase date" required type="date" value={date} max={toDayInput(nowMs)} onChange={setDate} error={attempted ? errors.date : undefined} disabled={saving} />
        <div className="flex flex-col gap-2">
          <label htmlFor="mp-remark" className="text-sm text-foreground">Remark</label>
          <Textarea id="mp-remark" value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="Optional" disabled={saving} />
        </div>
        <Button type="submit" size="lg" className="w-full sm:w-auto sm:self-end" disabled={saving} aria-busy={saving}>
          {saving && <Spinner />}
          Save purchase
        </Button>
      </section>
    </form>
  );
}
