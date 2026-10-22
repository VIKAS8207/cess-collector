"use client";

import { DataTable } from "@/components/ui/data-table";
import { useRef, useState } from "react";
import Link from "next/link";
import { EyeIcon, SearchIcon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/ui/pill";
import { SelectField } from "@/components/ui/select-field";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { TextField } from "@/components/auth/text-field";
import { BlockEmpty, BlockError } from "@/components/dashboard/block-states";
import { SideDrawer } from "@/components/gate/side-drawer";
import { useToast } from "@/components/gate/toast";
import {
  buyerOwners,
  getBuyersAdmin,
  getPartiesAdmin,
  submitBuyerActive,
  submitBuyerUpdate,
  submitPartyActive,
  submitPartyCommission,
} from "@/lib/api/admin";
import { forcedErrors } from "@/lib/api/gate";
import { activityEvents } from "@/lib/domain/admin-store";
import { describeCommission, toNum } from "@/lib/domain/agent-math";
import { getParty } from "@/lib/domain/agent-store";
import type { CommissionType } from "@/lib/domain/agent-types";
import { useStoreVersion } from "@/lib/domain/store";
import { allBuyers } from "@/lib/domain/trader-store";
import { formatStamp } from "@/lib/format";
import { useLiveQuery } from "@/hooks/use-live-query";
import { useHotkey } from "@/hooks/use-hotkey";

const BODY = "h-[460px]";

function history(label: string) {
  return activityEvents(Date.now()).filter((e) => e.role === "admin" && e.ref === label).slice(0, 5);
}

function History({ label }: { label: string }) {
  const rows = history(label);
  return (
    <section className="flex flex-col gap-3" aria-label="Recent changes">
      <h3 className="text-heading-md text-foreground">Recent changes</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No admin changes yet.</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {rows.map((a) => (
            <li key={a.id} className="flex flex-col">
              <span className="text-foreground">{a.summary}</span>
              <span className="text-caption text-muted-foreground">
                {formatStamp(a.at)} · {a.user}
                {a.oldValue || a.newValue ? ` · ${a.oldValue ?? "—"} → ${a.newValue ?? "—"}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Link href={`/activity?q=${encodeURIComponent(label)}&range=90d`} className="text-sm text-primary hover:underline">
        Open in All Activity
      </Link>
    </section>
  );
}

function PartyDrawer({ id, admin, onClose }: { id: string | null; admin: string; onClose: () => void }) {
  useStoreVersion();
  const p = id ? getParty(id) : undefined;
  return (
    <SideDrawer
      open={!!p}
      onClose={onClose}
      wide
      title={p?.name ?? ""}
      description={p && (<><Pill tone="brand">{p.kind === "trader" ? "Trader" : "Seller"}</Pill><Pill tone={p.active === false ? "danger" : "neutral"}>{p.active === false ? "Inactive" : "Active"}</Pill><span>{p.phone}</span></>)}
    >
      {p && <PartyBody key={p.id} id={p.id} admin={admin} />}
    </SideDrawer>
  );
}

function PartyBody({ id, admin }: { id: string; admin: string }) {
  const p = getParty(id)!;
  const toast = useToast();
  const [type, setType] = useState<CommissionType>(p.commission.type);
  const [rate, setRate] = useState(String(p.commission.rate || ""));
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const n = type === "none" ? 0 : toNum(rate);
  const err = type !== "none" && (Number.isNaN(n) || n <= 0 || (type === "percent" && n > 100)) ? "Enter a valid rate." : undefined;
  const active = p.active !== false;

  const save = async () => {
    setAttempted(true);
    if (err || saving) return;
    setSaving(true);
    await submitPartyCommission(id, { type, rate: n }, admin);
    setSaving(false);
    setAttempted(false);
    toast.push(`Commission updated: ${describeCommission({ type, rate: n })}.`);
  };

  return (
    <>
      {p.kind === "trader" ? (
        <section className="flex flex-col gap-4" aria-labelledby="pa-com">
          <h3 id="pa-com" className="text-heading-md text-foreground">Commission</h3>
          <p className="text-sm text-muted-foreground">
            Now <span className="text-foreground">{describeCommission(p.commission)}</span> since {formatStamp(p.commission.since)}. Agent pages use the latest rate for new sales only. Past sales keep their rate.
          </p>
          <form noValidate className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField id="pa-type" label="Type" value={type} onChange={(v) => setType(v as CommissionType)} options={[{ value: "percent", label: "% of sale value" }, { value: "flat", label: "Flat ₹ per unit" }, { value: "none", label: "No commission" }]} disabled={saving} />
              <TextField id="pa-rate" label={type === "percent" ? "Rate (%)" : "Rate (₹ per unit)"} inputMode="decimal" value={type === "none" ? "" : rate} onChange={setRate} disabled={type === "none" || saving} error={attempted ? err : undefined} autoComplete="off" />
            </div>
            <Button type="submit" className="sm:self-end" disabled={saving} aria-busy={saving}>
              {saving && <Spinner />}
              Update commission
            </Button>
          </form>
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">Sellers have no commission setting.</p>
      )}
      <section className="flex flex-col gap-3" aria-label="Status">
        <h3 className="text-heading-md text-foreground">Status</h3>
        <Button
          variant="outline"
          className="self-start"
          disabled={toggling}
          aria-busy={toggling}
          onClick={async () => {
            setToggling(true);
            await submitPartyActive(id, !active, admin);
            setToggling(false);
            toast.push(active ? `${p.name} deactivated.` : `${p.name} activated.`);
          }}
        >
          {toggling && <Spinner />}
          {active ? "Deactivate" : "Activate"}
        </Button>
        <p className="text-caption text-muted-foreground">Parties cannot be deleted. An inactive party is hidden from new sales.</p>
      </section>
      <History label={p.name} />
    </>
  );
}

export function PartiesTab({ admin, initialId }: { admin: string; initialId: string | null }) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<"" | "trader" | "seller">("");
  const [status, setStatus] = useState<"" | "active" | "inactive">("");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(initialId);
  const list = useLiveQuery(`pa:${kind}:${status}:${q}`, (a) =>
    getPartiesAdmin({ kind: kind || undefined, status: status || undefined, q }, { forceError: a === 0 && forcedErrors().has("parties") })
  );
  useHotkey("/", () => searchRef.current?.focus());
  const rows = list.status === "ready" ? list.data : [];

  return (
    <Card className="gap-4">
      <div className="grid gap-4 px-(--card-spacing) sm:grid-cols-2 xl:grid-cols-4">
        <SelectField id="pa-kind" label="Kind" value={kind} onChange={(v) => setKind(v as "" | "trader" | "seller")} options={[{ value: "", label: "All" }, { value: "trader", label: "Trader" }, { value: "seller", label: "Seller" }]} />
        <SelectField id="pa-status" label="Status" value={status} onChange={(v) => setStatus(v as "" | "active" | "inactive")} options={[{ value: "", label: "All" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} />
        <div className="flex flex-col gap-2 sm:col-span-2">
          <label htmlFor="pa-search" className="text-sm text-foreground">Search</label>
          <div className="relative">
            <SearchIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="pa-search" ref={searchRef} data-page-search value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or phone" title="Search (/)" aria-keyshortcuts="/" autoComplete="off" className="pl-9" />
          </div>
        </div>
      </div>
      <div className="px-(--card-spacing)">
        {list.status === "loading" && (
          <div className={BODY} role="status" aria-label="Loading parties">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex h-14 items-center gap-4"><Skeleton className="h-4 w-36" /><Skeleton className="h-4 flex-1" /></div>
            ))}
          </div>
        )}
        {list.status === "error" && <BlockError onRetry={list.retry} className={BODY} />}
        {list.status === "ready" && rows.length === 0 && <BlockEmpty icon={UsersIcon} text="No parties match." actionLabel="Clear filters" onAction={() => { setKind(""); setStatus(""); setQ(""); }} className={BODY} />}
        {list.status === "ready" && rows.length > 0 && (
          <DataTable
            id="pa"
            caption="Parties"
            columns={[
              { key: "name", header: "Name", primary: true, cell: (p) => p.name },
              { key: "phone", header: "Phone", hideBelow: "xl", cell: (p) => <span className="text-caption tabular-nums text-muted-foreground">{p.phone}</span> },
              { key: "kind", header: "Kind", cell: (p) => <Pill tone="brand">{p.kind === "trader" ? "Trader" : "Seller"}</Pill> },
              { key: "commission", header: "Commission", hideBelow: "lg", cell: (p) => (p.kind === "trader" ? describeCommission(p.commission) : "—") },
              { key: "status", header: "Status", cell: (p) => <Pill tone={p.active === false ? "danger" : "neutral"}>{p.active === false ? "Inactive" : "Active"}</Pill> },
            ]}
            rows={rows}
            rowKey={(p) => p.id}
            pageSize={10}
            minWidth={420}
            actionLabel={(p) => `Actions for ${p.name}`}
            actions={(p) => [{ label: "View", icon: EyeIcon, onSelect: () => setOpenId(p.id) }]}
          />
        )}
      </div>
      <PartyDrawer id={openId} admin={admin} onClose={() => setOpenId(null)} />
    </Card>
  );
}

// ---------- buyers ----------

function BuyerDrawer({ id, admin, onClose }: { id: string | null; admin: string; onClose: () => void }) {
  useStoreVersion();
  const b = id ? allBuyers().find((x) => x.id === id) : undefined;
  return (
    <SideDrawer
      open={!!b}
      onClose={onClose}
      title={b?.name ?? ""}
      description={b && (<><Pill tone={b.active === false ? "danger" : "neutral"}>{b.active === false ? "Inactive" : "Active"}</Pill><span>Owner: {b.owner ?? "Trader"}</span></>)}
    >
      {b && <BuyerBody key={b.id} id={b.id} admin={admin} />}
    </SideDrawer>
  );
}

function BuyerBody({ id, admin }: { id: string; admin: string }) {
  const b = allBuyers().find((x) => x.id === id)!;
  const toast = useToast();
  const [name, setName] = useState(b.name);
  const [phone, setPhone] = useState(b.phone);
  const [address, setAddress] = useState(b.address);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const errors = { name: name.trim() ? undefined : "Enter the name.", phone: phone.replace(/\D/g, "").length === 10 ? undefined : "Enter a 10-digit phone number." };
  const active = b.active !== false;

  const save = async () => {
    setAttempted(true);
    if (errors.name || errors.phone || saving) return;
    setSaving(true);
    await submitBuyerUpdate(id, { name, phone: phone.replace(/\D/g, ""), address }, admin);
    setSaving(false);
    setAttempted(false);
    toast.push("Buyer saved.");
  };

  return (
    <>
      <section className="flex flex-col gap-4" aria-labelledby="by-contact">
        <h3 id="by-contact" className="text-heading-md text-foreground">Contact</h3>
        <form noValidate className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <TextField id="bb-name" label="Name" required value={name} onChange={setName} error={attempted ? errors.name : undefined} autoComplete="off" disabled={saving} />
          <TextField id="bb-phone" label="Phone" required type="tel" value={phone} onChange={setPhone} error={attempted ? errors.phone : undefined} autoComplete="off" disabled={saving} />
          <TextField id="bb-address" label="Address" value={address} onChange={setAddress} autoComplete="off" disabled={saving} />
          <Button type="submit" className="sm:self-end" disabled={saving} aria-busy={saving}>
            {saving && <Spinner />}
            Save contact
          </Button>
        </form>
      </section>
      <section className="flex flex-col gap-3" aria-label="Status">
        <h3 className="text-heading-md text-foreground">Status</h3>
        <Button
          variant="outline"
          className="self-start"
          disabled={toggling}
          aria-busy={toggling}
          onClick={async () => {
            setToggling(true);
            await submitBuyerActive(id, !active, admin);
            setToggling(false);
            toast.push(active ? `${b.name} deactivated.` : `${b.name} activated.`);
          }}
        >
          {toggling && <Spinner />}
          {active ? "Deactivate" : "Activate"}
        </Button>
        <p className="text-caption text-muted-foreground">An inactive buyer cannot be picked for new sales. Their history stays.</p>
      </section>
      <History label={b.name} />
    </>
  );
}

export function BuyersTab({ admin, initialId }: { admin: string; initialId: string | null }) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [owner, setOwner] = useState("");
  const [status, setStatus] = useState<"" | "active" | "inactive">("");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(initialId);
  const list = useLiveQuery(`bu:${owner}:${status}:${q}`, (a) =>
    getBuyersAdmin({ owner: owner || undefined, status: status || undefined, q }, { forceError: a === 0 && forcedErrors().has("buyers") })
  );
  useHotkey("/", () => searchRef.current?.focus());
  const rows = list.status === "ready" ? list.data : [];

  return (
    <Card className="gap-4">
      <div className="grid gap-4 px-(--card-spacing) sm:grid-cols-2 xl:grid-cols-4">
        <SelectField id="bu-owner" label="Owning trader" value={owner} onChange={setOwner} options={[{ value: "", label: "All traders" }, ...buyerOwners().map((o) => ({ value: o, label: o }))]} />
        <SelectField id="bu-status" label="Status" value={status} onChange={(v) => setStatus(v as "" | "active" | "inactive")} options={[{ value: "", label: "All" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} />
        <div className="flex flex-col gap-2 sm:col-span-2">
          <label htmlFor="bu-search" className="text-sm text-foreground">Search</label>
          <div className="relative">
            <SearchIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="bu-search" ref={searchRef} data-page-search value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or phone" title="Search (/)" aria-keyshortcuts="/" autoComplete="off" className="pl-9" />
          </div>
        </div>
      </div>
      <div className="px-(--card-spacing)">
        {list.status === "loading" && (
          <div className={BODY} role="status" aria-label="Loading buyers">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex h-14 items-center gap-4"><Skeleton className="h-4 w-36" /><Skeleton className="h-4 flex-1" /></div>
            ))}
          </div>
        )}
        {list.status === "error" && <BlockError onRetry={list.retry} className={BODY} />}
        {list.status === "ready" && rows.length === 0 && <BlockEmpty icon={UsersIcon} text="No buyers match." actionLabel="Clear filters" onAction={() => { setOwner(""); setStatus(""); setQ(""); }} className={BODY} />}
        {list.status === "ready" && rows.length > 0 && (
          <DataTable
            id="bu"
            caption="Buyers across all traders"
            columns={[
              { key: "name", header: "Name", primary: true, cell: (b) => b.name },
              { key: "phone", header: "Phone", hideBelow: "lg", cell: (b) => <span className="text-caption tabular-nums text-muted-foreground">{b.phone}</span> },
              { key: "owner", header: "Owning trader", cell: (b) => b.owner ?? "Trader" },
              { key: "status", header: "Status", cell: (b) => <Pill tone={b.active === false ? "danger" : "neutral"}>{b.active === false ? "Inactive" : "Active"}</Pill> },
            ]}
            rows={rows}
            rowKey={(b) => b.id}
            pageSize={10}
            minWidth={420}
            actionLabel={(b) => `Actions for ${b.name}`}
            actions={(b) => [{ label: "View", icon: EyeIcon, onSelect: () => setOpenId(b.id) }]}
          />
        )}
      </div>
      <BuyerDrawer id={openId} admin={admin} onClose={() => setOpenId(null)} />
    </Card>
  );
}
