"use client";

import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { TextField } from "@/components/auth/text-field";
import { listBuyers, submitBuyer } from "@/lib/api/trader";
import { useAuth } from "@/lib/auth-store";
import { useStoreVersion } from "@/lib/domain/store";
import { buyerFinance } from "@/lib/domain/trader-store";
import { formatInr } from "@/lib/format";

/** Searchable buyer list with an inline "+ New buyer" mini form. */
export function BuyerPicker({
  value,
  onChange,
  error,
  disabled,
}: {
  value: string;
  onChange: (id: string) => void;
  error?: string;
  disabled?: boolean;
}) {
  useStoreVersion();
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [attempted, setAttempted] = useState(false);

  const buyers = listBuyers();
  const selected = buyers.find((b) => b.id === value);
  const text = q.trim().toLowerCase();
  const matches = buyers.filter((b) => !text || b.name.toLowerCase().includes(text) || b.phone.includes(text)).slice(0, 6);

  const nameError = name.trim() ? undefined : "Enter the buyer name.";
  const phoneError = phone.replace(/\D/g, "").length === 10 ? undefined : "Enter a 10-digit phone number.";

  const save = async () => {
    setAttempted(true);
    if (nameError || phoneError || saving) return;
    setSaving(true);
    const b = await submitBuyer({ name: name.trim(), phone: phone.replace(/\D/g, ""), address: "", opening: 0 }, user?.name);
    setSaving(false);
    setAdding(false);
    setName("");
    setPhone("");
    setAttempted(false);
    setQ("");
    onChange(b.id);
  };

  if (selected && !adding) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border p-4">
        <div className="flex min-w-0 flex-col">
          <span id="bf-buyer" className="text-[15px] text-foreground">{selected.name}</span>
          <span className="text-caption tabular-nums text-muted-foreground">
            {selected.phone} · Due {formatInr(buyerFinance(selected.id).totalDue)}
          </span>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange("")} disabled={disabled}>
          Change buyer
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {!adding && (
        <>
          <label htmlFor="bf-buyer-search" className="text-sm text-foreground">
            Buyer
            <span aria-hidden="true" className="text-destructive"> *</span>
          </label>
          <Input
            id="bf-buyer-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search your buyers"
            autoComplete="off"
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "bf-buyer-error" : undefined}
          />
          {error && <p id="bf-buyer-error" className="text-sm text-foreground">{error}</p>}
          <ul aria-label="Buyers" className="flex flex-col divide-y divide-border rounded-field border border-border">
            {matches.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => onChange(b.id)}
                  disabled={disabled}
                  className="flex min-h-12 w-full items-center justify-between gap-3 px-3 py-2 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span className="text-[15px] text-foreground">{b.name}</span>
                  <span className="text-caption tabular-nums text-muted-foreground">{b.phone}</span>
                </button>
              </li>
            ))}
            {matches.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">No buyer matches. Add a new one.</li>}
          </ul>
          <Button type="button" variant="outline" className="self-start" onClick={() => { setAdding(true); setName(q); }} disabled={disabled}>
            <PlusIcon aria-hidden="true" />
            New buyer
          </Button>
        </>
      )}
      {adding && (
        <div className="flex flex-col gap-4 rounded-card border border-border p-4">
          <p className="text-[15px] text-foreground">New buyer</p>
          <TextField id="nb-name" label="Name" required value={name} onChange={setName} error={attempted ? nameError : undefined} autoComplete="off" disabled={saving} />
          <TextField id="nb-phone" label="Phone" required type="tel" inputMode="tel" value={phone} onChange={setPhone} error={attempted ? phoneError : undefined} autoComplete="off" disabled={saving} />
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={() => void save()} disabled={saving} aria-busy={saving}>
              {saving && <Spinner />}
              Save buyer
            </Button>
            <Button type="button" variant="outline" onClick={() => setAdding(false)} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
