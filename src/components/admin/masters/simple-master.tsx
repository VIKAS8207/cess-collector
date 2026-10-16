"use client";

import { useState } from "react";
import { DatabaseIcon } from "lucide-react";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { SelectField } from "@/components/ui/select-field";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { FormBanner } from "@/components/auth/form-banner";
import { TextField } from "@/components/auth/text-field";
import { BlockEmpty, BlockError } from "@/components/dashboard/block-states";
import { useToast } from "@/components/gate/toast";
import { RevealPanel, useReveal } from "@/components/gate/reveal-panel";
import { getMasters, submitAddMaster, submitMasterActive, submitUpdateMaster } from "@/lib/api/admin";
import { forcedErrors } from "@/lib/api/gate";
import { itemUsage } from "@/lib/domain/admin-store";
import type { MasterEntry, MasterKind } from "@/lib/domain/admin-types";
import { units, type Unit } from "@/lib/domain/agent-types";
import { useLiveQuery } from "@/hooks/use-live-query";
import { useHotkey } from "@/hooks/use-hotkey";

const copy: Record<MasterKind, { singular: string; plural: string; used: string }> = {
  items: { singular: "item", plural: "Items", used: "Used in goods lines" },
  vehicleTypes: { singular: "vehicle type", plural: "Vehicle types", used: "" },
  purposes: { singular: "purpose", plural: "Purposes", used: "" },
  paymentModes: { singular: "payment mode", plural: "Payment modes", used: "" },
};

const unitOptions = units.map((u) => ({ value: u, label: u }));
const BODY = "h-[420px]";

export function SimpleMaster({ kind, admin }: { kind: MasterKind; admin: string }) {
  const toast = useToast();
  const reveal = useReveal(`ms-new-${kind}`);
  const [label, setLabel] = useState("");
  const [unit, setUnit] = useState<Unit>("bags");
  const [attempted, setAttempted] = useState(false);
  const [adding, setAdding] = useState(false);
  const [duplicate, setDuplicate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editUnit, setEditUnit] = useState<Unit>("bags");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const list = useLiveQuery(`master:${kind}`, (a) => getMasters(kind, { forceError: a === 0 && forcedErrors().has("masters") }));
  useHotkey("/", () => (reveal.expanded ? document.getElementById(`ms-new-${kind}`)?.focus() : reveal.open()));
  const c = copy[kind];

  const err = !label.trim() ? `Enter the ${c.singular} name.` : duplicate ? `This ${c.singular} already exists.` : undefined;

  const add = async () => {
    setAttempted(true);
    if (err || adding) return;
    setAdding(true);
    const res = await submitAddMaster(kind, label, kind === "items" ? unit : undefined, admin);
    setAdding(false);
    if (res.ok) {
      toast.push(`${c.singular[0].toUpperCase()}${c.singular.slice(1)} added.`);
      setLabel("");
      setAttempted(false);
      reveal.close();
    } else setDuplicate(true);
  };

  const saveEdit = async (m: MasterEntry) => {
    if (!editLabel.trim()) return;
    setBusy(m.id);
    await submitUpdateMaster(m.id, { label: editLabel, defaultUnit: kind === "items" ? editUnit : undefined }, admin);
    setBusy(null);
    setEditId(null);
    toast.push("Saved.");
  };

  const toggle = async (m: MasterEntry) => {
    setBusy(m.id);
    const used = kind === "items" && m.active ? itemUsage(m.label) : 0;
    await submitMasterActive(m.id, !m.active, admin);
    setBusy(null);
    setConfirmId(null);
    setNotice(used > 0 ? `${m.label} is used in ${used} lines. It is deactivated for new use only; history is kept.` : null);
    toast.push(m.active ? `${m.label} deactivated.` : `${m.label} activated.`);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <Button onClick={reveal.open} aria-expanded={reveal.expanded} aria-controls={`ms-panel-${kind}`} title="Add (/)">
          <PlusIcon aria-hidden="true" />
          New {c.singular}
        </Button>
      </div>
      <RevealPanel id={`ms-panel-${kind}`} mounted={reveal.mounted} expanded={reveal.expanded} title={`New ${c.singular}`} onCancel={reveal.close} wide>
        <Card className="gap-0 p-0">
      <form noValidate className="flex flex-wrap items-end gap-3 p-6" onSubmit={(e) => { e.preventDefault(); void add(); }}>
        <TextField
          id={`ms-new-${kind}`}
          label={`New ${c.singular}`}
          value={label}
          onChange={(v) => { setLabel(v); setDuplicate(false); }}
          error={attempted || duplicate ? err : undefined}
          className="min-w-52 flex-1"
          autoComplete="off"
          disabled={adding}
        />
        {kind === "items" && <SelectField id="ms-unit" label="Default unit" value={unit} onChange={(v) => setUnit(v as Unit)} options={unitOptions} disabled={adding} />}
        <Button type="submit" disabled={adding} aria-busy={adding}>
          {adding && <Spinner />}
          Add {c.singular}
        </Button>
      </form>
        </Card>
      </RevealPanel>
    <Card className="gap-4">
      <div className="px-(--card-spacing)">
        <FormBanner tone="info" message={notice} />
      </div>
      <div className="px-(--card-spacing)">
        {list.status === "loading" && (
          <div className={BODY} role="status" aria-label={`Loading ${c.plural.toLowerCase()}`}>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex h-14 items-center gap-4">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            ))}
          </div>
        )}
        {list.status === "error" && <BlockError onRetry={list.retry} className={BODY} />}
        {list.status === "ready" && list.data.length === 0 && <BlockEmpty icon={DatabaseIcon} text={`No ${c.plural.toLowerCase()} yet.`} actionLabel={`Add ${c.singular}`} onAction={() => document.getElementById(`ms-new-${kind}`)?.focus()} className={BODY} />}
        {list.status === "ready" && list.data.length > 0 && (
          <ul className={`${BODY} overflow-y-auto`}>
            {list.data.map((m) => (
              <li key={m.id} className="flex min-h-14 flex-col justify-center gap-3 border-b border-border py-2 last:border-b-0">
                {editId === m.id ? (
                  <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); void saveEdit(m); }}>
                    <TextField id={`ms-edit-${m.id}`} label="Name" value={editLabel} onChange={setEditLabel} className="min-w-48 flex-1" autoComplete="off" disabled={busy === m.id} />
                    {kind === "items" && <SelectField id={`ms-eu-${m.id}`} label="Default unit" value={editUnit} onChange={(v) => setEditUnit(v as Unit)} options={unitOptions} disabled={busy === m.id} />}
                    <Button type="submit" disabled={busy === m.id || !editLabel.trim()} aria-busy={busy === m.id}>
                      {busy === m.id && <Spinner />}
                      Save
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setEditId(null)}>Cancel</Button>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="flex items-center gap-3">
                      <span className="text-[15px] text-foreground">{m.label}</span>
                      {m.defaultUnit && <span className="text-caption text-muted-foreground">{m.defaultUnit}</span>}
                      <Pill tone={m.active ? "neutral" : "danger"}>{m.active ? "Active" : "Inactive"}</Pill>
                    </span>
                    <span className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => { setEditId(m.id); setEditLabel(m.label); setEditUnit(m.defaultUnit ?? "bags"); }}>Rename</Button>
                      <Button variant="outline" size="sm" onClick={() => (m.active ? setConfirmId(m.id) : void toggle(m))} disabled={busy === m.id}>
                        {m.active ? "Deactivate" : "Activate"}
                      </Button>
                    </span>
                  </div>
                )}
                {confirmId === m.id && (
                  <div role="alertdialog" aria-label={`Deactivate ${m.label}`} className="flex flex-col gap-3 rounded-card border border-destructive/50 bg-destructive/5 p-4">
                    <p className="text-sm text-foreground">
                      {kind === "items" && itemUsage(m.label) > 0
                        ? `${m.label} is used in ${itemUsage(m.label)} lines. Deactivating stops new use only; history is kept.`
                        : `${m.label} will no longer be offered in forms. Existing records keep it.`}
                    </p>
                    <div className="flex gap-3">
                      <Button onClick={() => void toggle(m)} disabled={busy === m.id} aria-busy={busy === m.id}>
                        {busy === m.id && <Spinner />}
                        Deactivate
                      </Button>
                      <Button variant="outline" onClick={() => setConfirmId(null)}>Cancel</Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
    </div>
  );
}
