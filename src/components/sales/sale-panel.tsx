"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { Spinner } from "@/components/ui/spinner";
import { FormBanner } from "@/components/auth/form-banner";
import { TextField } from "@/components/auth/text-field";
import { SideDrawer } from "@/components/gate/side-drawer";
import { LineStatusPill } from "@/components/agent/pills";
import { listTraders, submitSale } from "@/lib/api/agent";
import { commissionFor, describeCommission, toNum } from "@/lib/domain/agent-math";
import { getParty, getReceipt, lineStatus, lineStock, partyBalance } from "@/lib/domain/agent-store";
import { useStoreVersion } from "@/lib/domain/store";
import { formatInr, formatQty } from "@/lib/format";

const hhmm = (t: number) => {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

type Row = { qty: string; rate: string };

function parseTime(time: string): { at: number; error?: string } {
  const now = Date.now();
  const [h, m] = time.split(":").map(Number);
  const d = new Date(now);
  d.setHours(h || 0, m || 0, 0, 0);
  if (!time || Number.isNaN(h)) return { at: now, error: "Enter a time." };
  if (d.getTime() > now) return { at: now, error: "Time cannot be in the future." };
  return { at: d.getTime() };
}

export function SalePanel({
  receiptId,
  focusLineId,
  agent,
  onClose,
  onDone,
}: {
  receiptId: string | null;
  focusLineId?: string;
  agent: string;
  onClose: () => void;
  onDone: (saleNo: string) => void;
}) {
  useStoreVersion();
  const receipt = receiptId ? getReceipt(receiptId) : undefined;
  const open = !!receipt;

  return (
    <SideDrawer
      open={open}
      onClose={onClose}
      wide
      title={receipt ? `Record sale · ${receipt.plate || receipt.no}` : ""}
      description={receipt && `${receipt.no} · received from ${receipt.driverName}`}
    >
      {receipt && (
        <PanelBody key={receipt.id} receiptId={receipt.id} focusLineId={focusLineId} agent={agent} onDone={onDone} />
      )}
    </SideDrawer>
  );
}

function PanelBody({
  receiptId,
  focusLineId,
  agent,
  onDone,
}: {
  receiptId: string;
  focusLineId?: string;
  agent: string;
  onDone: (saleNo: string) => void;
}) {
  const receipt = getReceipt(receiptId)!;
  const traders = listTraders();
  const open = receipt.lines
    .map((line) => ({ line, stock: lineStock(receipt, line) }))
    .filter((x) => x.stock.remaining > 0);

  const [partyId, setPartyId] = useState("");
  const [rows, setRows] = useState<Record<string, Row>>(() => {
    const init: Record<string, Row> = {};
    for (const x of open) {
      init[x.line.id] = { qty: x.line.id === focusLineId || open.length === 1 ? String(x.stock.remaining) : "", rate: "" };
    }
    return init;
  });
  const [time, setTime] = useState(() => hhmm(Date.now()));
  const [submitting, setSubmitting] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const party = partyId ? getParty(partyId) : undefined;
  const setRow = (id: string, patch: Partial<Row>) => setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));

  const calc = open.map(({ line, stock }) => {
    const row = rows[line.id] ?? { qty: "", rate: "" };
    const qty = toNum(row.qty);
    const rate = toNum(row.rate);
    const used = row.qty.trim() !== "";
    const errors: { qty?: string; rate?: string } = {};
    if (used) {
      if (Number.isNaN(qty) || qty <= 0) errors.qty = "Enter a quantity.";
      else if (qty > stock.remaining) errors.qty = `Only ${formatQty(stock.remaining)} ${line.unit} left.`;
      if (Number.isNaN(rate) || rate <= 0) errors.rate = "Enter the rate.";
    }
    const amount = used && !errors.qty && !errors.rate ? Math.round(qty * rate * 100) / 100 : 0;
    const com = party && amount ? commissionFor(party.commission, qty, amount) : null;
    return { line, stock, row, used, qty, rate, errors, amount, com };
  });

  const usedRows = calc.filter((c) => c.used);
  const hasErrors = usedRows.some((c) => c.errors.qty || c.errors.rate);
  const total = calc.reduce((a, c) => a + c.amount, 0);
  const totalCom = calc.reduce((a, c) => a + (c.com?.amount ?? 0), 0);

  // Time may be edited, but only within today and never in the future.
  const { at, error: timeError } = parseTime(time);

  const valid = !!party && usedRows.length > 0 && !hasErrors && !timeError;

  const submit = async () => {
    setAttempted(true);
    if (!valid || submitting) return;
    setSubmitting(true);
    setProblem(null);
    const result = await submitSale(
      {
        receiptId,
        partyId,
        at,
        lines: usedRows.map((c) => ({ receiptLineId: c.line.id, qty: c.qty, rate: c.rate })),
      },
      agent
    );
    setSubmitting(false);
    if (result.ok) onDone(result.sale.no);
    else if (result.code === "oversell")
      setProblem(`Only ${formatQty(result.remaining)} ${result.unit} of ${result.item} left. Reduce the quantity.`);
    else setProblem("Check the quantities and rates, then try again.");
  };

  if (open.length === 0) {
    return <p className="text-sm text-muted-foreground">Everything in this lot is sold.</p>;
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-8"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <FormBanner message={problem ?? (attempted && !valid ? "Fix the highlighted fields to record this sale." : null)} />

      <section className="flex flex-col gap-4">
        <h3 className="text-heading-md text-foreground">Buyer</h3>
        <SelectField
          id="sp-party"
          label="Trader"
          required
          value={partyId}
          onChange={setPartyId}
          error={attempted && !party ? "Choose the buyer." : undefined}
          hint={party ? `Commission: ${describeCommission(party.commission)}` : "Traders only"}
          options={[{ value: "", label: "Select trader" }, ...traders.map((t) => ({ value: t.id, label: `${t.name} · ${describeCommission(t.commission)}` }))]}
        />
        {party?.creditBlocked && (
          <FormBanner tone="info" message={`${party.name} has a credit warning. You can still record this sale.`} />
        )}
        {party && (
          <p className="rounded-field bg-muted px-3 py-2 text-sm tabular-nums text-foreground">
            Current balance for {party.name}:{" "}
            {partyBalance(party.id) > 0 ? `${formatInr(partyBalance(party.id))} owed to you` : "settled"}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h3 className="text-heading-md text-foreground">Goods</h3>
        <p className="text-caption text-muted-foreground">
          Enter a quantity for each item you are selling now. Leave an item empty to sell it later or to someone else.
        </p>
        <ul className="flex flex-col gap-4">
          {calc.map((c) => (
            <li key={c.line.id} className="flex flex-col gap-4 rounded-card border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[15px] text-foreground">
                  {c.line.item} <span className="text-muted-foreground">· {c.line.unit}</span>
                </p>
                <LineStatusPill status={lineStatus(c.stock)} />
              </div>
              <p className="text-caption tabular-nums text-muted-foreground">
                Remaining {formatQty(c.stock.remaining)} {c.line.unit}
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  id={`sp-qty-${c.line.id}`}
                  label={`Quantity (${c.line.unit})`}
                  inputMode="decimal"
                  value={c.row.qty}
                  onChange={(v) => setRow(c.line.id, { qty: v })}
                  error={c.errors.qty}
                  autoComplete="off"
                  disabled={submitting}
                  hint={
                    c.used && !c.errors.qty
                      ? `Left after this sale: ${formatQty(c.stock.remaining - c.qty)} ${c.line.unit}`
                      : undefined
                  }
                />
                <TextField
                  id={`sp-rate-${c.line.id}`}
                  label={`Rate per ${c.line.unit === "pieces" ? "piece" : c.line.unit.replace(/s$/, "")} (₹)`}
                  inputMode="decimal"
                  value={c.row.rate}
                  onChange={(v) => setRow(c.line.id, { rate: v })}
                  error={c.errors.rate}
                  autoComplete="off"
                  disabled={submitting}
                />
              </div>
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-caption text-muted-foreground">Amount</dt>
                  <dd className="text-[15px] tabular-nums text-foreground">{c.amount ? formatInr(c.amount) : "—"}</dd>
                </div>
                <div>
                  <dt className="text-caption text-muted-foreground">
                    Commission{c.com ? ` (${c.com.label})` : ""}
                  </dt>
                  <dd className="text-[15px] tabular-nums text-foreground">{c.com ? formatInr(c.com.amount) : "—"}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-4">
        <TextField
          id="sp-time"
          label="Sale time (today)"
          type="time"
          value={time}
          onChange={setTime}
          error={attempted ? timeError : undefined}
          disabled={submitting}
        />
        <dl className="grid gap-3 rounded-card bg-muted p-4 sm:grid-cols-2">
          <div>
            <dt className="text-caption text-muted-foreground">Sale value</dt>
            <dd className="text-heading-md tabular-nums text-foreground">{formatInr(total)}</dd>
          </div>
          <div>
            <dt className="text-caption text-muted-foreground">
              Commission{party ? ` (${describeCommission(party.commission)})` : ""}
            </dt>
            <dd className="text-heading-md tabular-nums text-foreground">{formatInr(totalCom)}</dd>
          </div>
        </dl>
        <Button type="submit" size="lg" className="w-full sm:w-auto sm:self-end" disabled={!valid || submitting} aria-busy={submitting}>
          {submitting && <Spinner />}
          {submitting ? "Recording" : "Record sale"}
        </Button>
      </section>
    </form>
  );
}
