"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { Spinner } from "@/components/ui/spinner";
import { TextField } from "@/components/auth/text-field";
import { SideDrawer } from "@/components/gate/side-drawer";
import { submitParty } from "@/lib/api/agent";
import { toNum } from "@/lib/domain/agent-math";
import type { CommissionType, Party, PartyKind } from "@/lib/domain/agent-types";

export function AddPartyDrawer({
  open,
  defaultKind,
  onClose,
  onAdded,
}: {
  open: boolean;
  defaultKind: PartyKind;
  onClose: () => void;
  onAdded: (p: Party) => void;
}) {
  return (
    <SideDrawer open={open} onClose={onClose} title="Add party" description="Traders buy goods. Sellers own the goods you sell.">
      {open && <Body defaultKind={defaultKind} onAdded={onAdded} />}
    </SideDrawer>
  );
}

function Body({ defaultKind, onAdded }: { defaultKind: PartyKind; onAdded: (p: Party) => void }) {
  const [kind, setKind] = useState<PartyKind>(defaultKind);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [type, setType] = useState<CommissionType>("percent");
  const [rate, setRate] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);

  const rateNum = toNum(rate);
  const errors = {
    name: name.trim() ? undefined : "Enter the name.",
    phone: phone.replace(/\D/g, "").length === 10 ? undefined : "Enter a 10-digit phone number.",
    rate:
      kind === "trader" && type !== "none" && (Number.isNaN(rateNum) || rateNum <= 0 || (type === "percent" && rateNum > 100))
        ? "Enter a valid rate."
        : undefined,
  };
  const valid = !errors.name && !errors.phone && !errors.rate;

  const submit = async () => {
    setAttempted(true);
    if (!valid || saving) return;
    setSaving(true);
    const party = await submitParty({
      kind,
      name: name.trim(),
      phone: phone.replace(/\D/g, ""),
      address: address.trim(),
      commission: kind === "trader" ? { type, rate: type === "none" ? 0 : rateNum } : undefined,
    });
    setSaving(false);
    onAdded(party);
  };

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <SelectField
        id="ap-kind"
        label="Party type"
        value={kind}
        onChange={(v) => setKind(v as PartyKind)}
        options={[
          { value: "trader", label: "Trader (buyer)" },
          { value: "seller", label: "Seller (principal)" },
        ]}
        disabled={saving}
      />
      <TextField id="ap-name" label="Name" required value={name} onChange={setName} error={attempted ? errors.name : undefined} autoComplete="off" disabled={saving} />
      <TextField id="ap-phone" label="Phone" required type="tel" inputMode="tel" value={phone} onChange={setPhone} error={attempted ? errors.phone : undefined} autoComplete="off" disabled={saving} />
      <TextField id="ap-address" label="Address" value={address} onChange={setAddress} hint="Optional" autoComplete="off" disabled={saving} />
      {kind === "trader" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id="ap-ctype"
            label="Commission"
            value={type}
            onChange={(v) => setType(v as CommissionType)}
            options={[
              { value: "percent", label: "% of sale value" },
              { value: "flat", label: "Flat ₹ per unit" },
              { value: "none", label: "No commission" },
            ]}
            disabled={saving}
          />
          <TextField
            id="ap-crate"
            label={type === "percent" ? "Rate (%)" : "Rate (₹ per unit)"}
            inputMode="decimal"
            value={type === "none" ? "" : rate}
            onChange={setRate}
            disabled={type === "none" || saving}
            error={attempted ? errors.rate : undefined}
            autoComplete="off"
          />
        </div>
      )}
      <Button type="submit" size="lg" className="w-full sm:w-auto sm:self-end" disabled={saving} aria-busy={saving}>
        {saving && <Spinner />}
        Add party
      </Button>
    </form>
  );
}
