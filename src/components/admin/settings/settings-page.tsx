"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { SelectField } from "@/components/ui/select-field";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { FormBanner } from "@/components/auth/form-banner";
import { TextField } from "@/components/auth/text-field";
import { BlockError } from "@/components/dashboard/block-states";
import { PageHeader } from "@/components/gate/page-header";
import { useToast } from "@/components/gate/toast";
import { useAuth } from "@/lib/auth-store";
import {
  getSettings,
  submitAddGate,
  submitBusiness,
  submitGateActive,
  submitRenameGate,
  submitCess,
  submitThresholds,
  type SettingsSnapshot,
} from "@/lib/api/admin";
import { forcedErrors } from "@/lib/api/gate";
import { toNum } from "@/lib/domain/agent-math";
import { describeCess } from "@/lib/domain/trader-math";
import { formatStamp } from "@/lib/format";
import { useLiveQuery } from "@/hooks/use-live-query";
import { cn } from "cn";

let failedOnce = false;
/** Demo: open /settings?error=save to see one save failure and the retry. */
function maybeFail() {
  if (forcedErrors().has("save") && !failedOnce) {
    failedOnce = true;
    throw new Error("simulated failure");
  }
}

function CardSkeleton() {
  return (
    <Card role="status" aria-label="Loading settings" className="h-[360px]">
      <CardHeader>
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <div className="flex flex-col gap-4 px-(--card-spacing)">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-1/2" />
      </div>
    </Card>
  );
}

function CessCard({ s, admin }: { s: SettingsSnapshot["cess"]; admin: string }) {
  const toast = useToast();
  const [enabled, setEnabled] = useState(s.enabled);
  const [type, setType] = useState<"percent" | "flat">(s.type);
  const [rate, setRate] = useState(String(s.rate));
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const n = toNum(rate);
  const error = enabled && (Number.isNaN(n) || n <= 0 || (type === "percent" && n > 100)) ? "Enter a rate above zero." + (type === "percent" ? " Up to 100%." : "") : undefined;

  const save = async () => {
    setAttempted(true);
    setFailed(false);
    if (error || saving) return;
    setSaving(true);
    try {
      maybeFail();
      await submitCess({ enabled, type, rate: enabled ? n : s.rate }, admin);
      toast.push(`CESS rate saved: ${describeCess({ enabled, type, rate: enabled ? n : s.rate, since: 0 })}.`);
      setAttempted(false);
    } catch {
      setFailed(true);
    }
    setSaving(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-heading-md">CESS rate</CardTitle>
        <CardDescription>One rate for every trader. Traders see it as read-only.</CardDescription>
      </CardHeader>
      <form noValidate className="flex flex-col gap-4 px-(--card-spacing)" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <FormBanner message={failed ? "We couldn't save the CESS rate. Try again." : null} action={failed ? <Button type="button" variant="outline" onClick={() => void save()}>Try again</Button> : undefined} />
        <label className="flex min-h-10 cursor-pointer items-center gap-3 text-[15px]">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} disabled={saving} className="size-4 rounded-xs accent-primary" />
          CESS is switched on
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField id="sx-type" label="Rate type" value={type} onChange={(v) => setType(v as "percent" | "flat")} disabled={!enabled || saving} options={[{ value: "percent", label: "% of goods sale value" }, { value: "flat", label: "Flat per sale" }]} />
          <TextField id="sx-rate" label={type === "percent" ? "Rate (%)" : "Rate (₹ per sale)"} required={enabled} inputMode="decimal" value={rate} onChange={setRate} disabled={!enabled || saving} error={attempted ? error : undefined} autoComplete="off" />
        </div>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-caption text-muted-foreground">Effective from</dt><dd className="tabular-nums text-foreground">{s.since ? formatStamp(s.since) : "—"} (new saves take effect now)</dd></div>
          <div><dt className="text-caption text-muted-foreground">Last changed</dt><dd className="text-foreground">{s.lastChangedBy}, <span className="tabular-nums">{s.lastChangedAt ? formatStamp(s.lastChangedAt) : "—"}</span></dd></div>
        </dl>
        <p className="text-caption text-muted-foreground">Applies to new sales only. Past bills keep their snapshot.</p>
        <Button type="submit" className="sm:self-end" disabled={saving} aria-busy={saving}>
          {saving && <Spinner />}
          Save CESS rate
        </Button>
      </form>
    </Card>
  );
}

function ThresholdsCard({ s, admin }: { s: SettingsSnapshot; admin: string }) {
  const toast = useToast();
  const [over, setOver] = useState(String(s.overstayHours));
  const [due, setDue] = useState(String(s.overdueDays));
  const [otp, setOtp] = useState(String(s.otpCooldownSeconds));
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const int = (v: string, max: number) => {
    const n = toNum(v);
    return Number.isInteger(n) && n > 0 && n <= max ? undefined : `Enter a whole number from 1 to ${max}.`;
  };
  const errors = { over: int(over, 168), due: int(due, 365), otp: int(otp, 3600) };
  const valid = !errors.over && !errors.due && !errors.otp;

  const save = async () => {
    setAttempted(true);
    setFailed(false);
    if (!valid || saving) return;
    setSaving(true);
    try {
      maybeFail();
      await submitThresholds({ overstayHours: toNum(over), overdueDays: toNum(due), otpCooldownSeconds: toNum(otp) }, admin);
      toast.push("Thresholds saved.");
      setAttempted(false);
    } catch {
      setFailed(true);
    }
    setSaving(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-heading-md">Thresholds</CardTitle>
        <CardDescription>When a vehicle or a balance needs attention</CardDescription>
      </CardHeader>
      <form noValidate className="flex flex-col gap-4 px-(--card-spacing)" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <FormBanner message={failed ? "We couldn't save the thresholds. Try again." : null} action={failed ? <Button type="button" variant="outline" onClick={() => void save()}>Try again</Button> : undefined} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField id="th-over" label="Over-stay after (hours)" required inputMode="numeric" value={over} onChange={setOver} error={attempted ? errors.over : undefined} autoComplete="off" disabled={saving} />
          <TextField id="th-due" label="Overdue after (days)" required inputMode="numeric" value={due} onChange={setDue} error={attempted ? errors.due : undefined} autoComplete="off" disabled={saving} />
          <TextField id="th-otp" label="OTP resend cooldown (seconds)" required inputMode="numeric" value={otp} onChange={setOtp} error={attempted ? errors.otp : undefined} autoComplete="off" disabled={saving} />
          <TextField id="th-ret" label="Audit retention (days)" value={String(s.retentionDays)} onChange={() => {}} disabled hint="Fixed. Activity older than this is hidden." />
        </div>
        <Button type="submit" className="sm:self-end" disabled={saving} aria-busy={saving}>
          {saving && <Spinner />}
          Save thresholds
        </Button>
      </form>
    </Card>
  );
}

function GatesCard({ gates, admin }: { gates: SettingsSnapshot["gates"]; admin: string }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);

  const addErr = !name.trim() ? "Enter a gate name." : gates.some((g) => g.name.toLowerCase() === name.trim().toLowerCase()) ? "A gate with this name exists." : undefined;

  const add = async () => {
    setAttempted(true);
    if (addErr || adding) return;
    setAdding(true);
    await submitAddGate(name, admin);
    setAdding(false);
    setName("");
    setAttempted(false);
    toast.push("Gate added.");
  };

  const rename = async (id: string) => {
    if (!editName.trim()) return;
    setBusy(id);
    await submitRenameGate(id, editName, admin);
    setBusy(null);
    setEditId(null);
    toast.push("Gate renamed.");
  };

  const toggle = async (id: string, active: boolean) => {
    setBusy(id);
    setMessage(null);
    const res = await submitGateActive(id, active, admin);
    setBusy(null);
    if (!res.ok) setMessage("At least one gate must stay active.");
    else toast.push(active ? "Gate activated." : "Gate deactivated.");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-heading-md">Gates</CardTitle>
        <CardDescription>The first active gate is stamped on new gate records.</CardDescription>
      </CardHeader>
      <div className="flex flex-col gap-4 px-(--card-spacing)">
        <FormBanner message={message} />
        <ul className="flex flex-col">
          {gates.map((g) => (
            <li key={g.id} className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-border py-2 last:border-b-0">
              {editId === g.id ? (
                <form className="flex flex-1 flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); void rename(g.id); }}>
                  <TextField id={`gt-name-${g.id}`} label="Gate name" value={editName} onChange={setEditName} className="min-w-48 flex-1" autoComplete="off" disabled={busy === g.id} />
                  <Button type="submit" disabled={busy === g.id || !editName.trim()} aria-busy={busy === g.id}>
                    {busy === g.id && <Spinner />}
                    Save name
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setEditId(null)}>Cancel</Button>
                </form>
              ) : (
                <>
                  <span className="flex items-center gap-3">
                    <span className="text-[15px] text-foreground">{g.name}</span>
                    <Pill tone={g.active ? "neutral" : "danger"}>{g.active ? "Active" : "Inactive"}</Pill>
                  </span>
                  <span className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => { setEditId(g.id); setEditName(g.name); }}>Rename</Button>
                    <Button variant="outline" size="sm" onClick={() => void toggle(g.id, !g.active)} disabled={busy === g.id} aria-busy={busy === g.id}>
                      {busy === g.id && <Spinner />}
                      {g.active ? "Deactivate" : "Activate"}
                    </Button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
        <form noValidate className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); void add(); }}>
          <TextField id="gt-new" label="New gate" value={name} onChange={setName} error={attempted ? addErr : undefined} className="min-w-48 flex-1" autoComplete="off" disabled={adding} />
          <Button type="submit" disabled={adding} aria-busy={adding}>
            {adding && <Spinner />}
            Add gate
          </Button>
        </form>
      </div>
    </Card>
  );
}

function BusinessCard({ b, admin }: { b: SettingsSnapshot["business"]; admin: string }) {
  const toast = useToast();
  const [v, setV] = useState(b);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const errors = { name: v.name.trim() ? undefined : "Enter the business name.", city: v.city.trim() ? undefined : "Enter the city." };
  const valid = !errors.name && !errors.city;
  const set = (patch: Partial<typeof v>) => setV((p) => ({ ...p, ...patch }));

  const save = async () => {
    setAttempted(true);
    setFailed(false);
    if (!valid || saving) return;
    setSaving(true);
    try {
      maybeFail();
      await submitBusiness({ name: v.name.trim(), address: v.address.trim(), city: v.city.trim(), phone: v.phone.trim() }, admin);
      toast.push("Business info saved.");
      setAttempted(false);
    } catch {
      setFailed(true);
    }
    setSaving(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-heading-md">Business info</CardTitle>
        <CardDescription>Printed at the top of reports and statements for every role.</CardDescription>
      </CardHeader>
      <form noValidate className="flex flex-col gap-4 px-(--card-spacing)" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <FormBanner message={failed ? "We couldn't save the business info. Try again." : null} action={failed ? <Button type="button" variant="outline" onClick={() => void save()}>Try again</Button> : undefined} />
        <TextField id="bi-name" label="Business name" required value={v.name} onChange={(x) => set({ name: x })} error={attempted ? errors.name : undefined} autoComplete="off" disabled={saving} />
        <TextField id="bi-address" label="Address" value={v.address} onChange={(x) => set({ address: x })} autoComplete="off" disabled={saving} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField id="bi-city" label="City" required value={v.city} onChange={(x) => set({ city: x })} error={attempted ? errors.city : undefined} autoComplete="off" disabled={saving} />
          <TextField id="bi-phone" label="Phone" type="tel" value={v.phone} onChange={(x) => set({ phone: x })} autoComplete="off" disabled={saving} />
        </div>
        <Button type="submit" className="sm:self-end" disabled={saving} aria-busy={saving}>
          {saving && <Spinner />}
          Save business info
        </Button>
      </form>
    </Card>
  );
}

export function SettingsPage() {
  const { user } = useAuth();
  const admin = user?.name ?? "Admin";
  const q = useLiveQuery("settings", (a) => getSettings({ forceError: a === 0 && forcedErrors().has("settings") }));

  return (
    <div className="flex flex-col gap-8 lg:gap-10">
      <PageHeader title="Settings" description="Rates, thresholds, gates and business details for the whole system." />
      {q.status === "loading" && (
        <div className="grid gap-6 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      )}
      {q.status === "error" && (
        <Card className="h-[320px]">
          <BlockError onRetry={q.retry} className="h-full" />
        </Card>
      )}
      {q.status === "ready" && (
        <div className={cn("grid items-start gap-6 lg:grid-cols-2")}>
          <CessCard key={`s-${q.data.cess.lastChangedAt}-${q.data.cess.rate}-${q.data.cess.type}-${q.data.cess.enabled}`} s={q.data.cess} admin={admin} />
          <ThresholdsCard key={`t-${q.data.overstayHours}-${q.data.overdueDays}-${q.data.otpCooldownSeconds}`} s={q.data} admin={admin} />
          <GatesCard gates={q.data.gates} admin={admin} />
          <BusinessCard key={`b-${JSON.stringify(q.data.business)}`} b={q.data.business} admin={admin} />
        </div>
      )}
    </div>
  );
}
