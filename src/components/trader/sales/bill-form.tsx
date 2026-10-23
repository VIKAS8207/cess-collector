"use client";

import { useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select-field";
import { Spinner } from "@/components/ui/spinner";
import { FormBanner } from "@/components/auth/form-banner";
import { TextField } from "@/components/auth/text-field";
import { BuyerPicker } from "@/components/trader/sales/buyer-picker";
import { CessBasis, CessLine } from "@/components/trader/pills";
import { submitBill } from "@/lib/api/trader";
import { toNum } from "@/lib/domain/agent-math";
import { useStoreVersion } from "@/lib/domain/store";
import { computeCess } from "@/lib/domain/trader-math";
import { nextBillNo, cessConfig, stockLines } from "@/lib/domain/trader-store";
import { MAX_BILL_LINES, type Bill } from "@/lib/domain/trader-types";
import { formatInr, formatQty, formatStamp } from "@/lib/format";
import { useNow } from "@/hooks/use-now";

type Line = { key: number; stockId: string; qty: string; rate: string };
let lineKey = 0;
const blank = (stockId = "", qty = ""): Line => ({ key: ++lineKey, stockId, qty, rate: "" });

export function BillForm({
  trader,
  presetStockId,
  onSaved,
}: {
  trader: string;
  presetStockId?: string;
  onSaved: (b: Bill) => void;
}) {
  useStoreVersion();
  const now = useNow(1000);
  const [buyerId, setBuyerId] = useState("");
  const [filter, setFilter] = useState("");
  const [lines, setLines] = useState<Line[]>(() => {
    const preset = presetStockId ? stockLines().find((s) => s.id === presetStockId && s.remaining > 0) : undefined;
    return [preset ? blank(preset.id, String(preset.remaining)) : blank()];
  });
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const cfg = cessConfig();
  const stock = stockLines();
  const open = stock.filter((s) => s.remaining > 0);
  const text = filter.trim().toLowerCase();

  const calc = lines.map((l) => {
    const s = stock.find((x) => x.id === l.stockId);
    const qty = toNum(l.qty);
    const rate = toNum(l.rate);
    const errors: { stock?: string; qty?: string; rate?: string } = {};
    if (!s) errors.stock = "Choose the stock to sell.";
    if (s) {
      if (Number.isNaN(qty) || qty <= 0) errors.qty = "Enter a quantity.";
      else if (qty > s.remaining) errors.qty = `Only ${formatQty(s.remaining)} ${s.unit} left.`;
      if (Number.isNaN(rate) || rate <= 0) errors.rate = "Enter the sale rate.";
    }
    const goods = s && !errors.qty && !errors.rate ? Math.round(qty * rate * 100) / 100 : 0;
    return { l, s, qty, rate, errors, goods };
  });

  const goodsTotal = calc.reduce((a, c) => a + c.goods, 0);
  const cess = computeCess(cfg, goodsTotal);
  const payable = goodsTotal + cess;
  const linesValid = calc.length > 0 && calc.every((c) => !c.errors.stock && !c.errors.qty && !c.errors.rate);
  const valid = !!buyerId && linesValid;

  const setLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const reset = () => {
    setBuyerId("");
    setFilter("");
    setLines([blank()]);
    setAttempted(false);
    setFailed(false);
    setProblem(null);
  };

  const save = async () => {
    setAttempted(true);
    setFailed(false);
    setProblem(null);
    if (!valid || submitting) return;
    setSubmitting(true);
    try {
      const res = await submitBill({ buyerId, lines: calc.map((c) => ({ stockId: c.l.stockId, qty: c.qty, rate: c.rate })) }, trader);
      if (res.ok) {
        onSaved(res.bill);
        reset();
        requestAnimationFrame(() => document.getElementById("bf-buyer-search")?.focus());
      } else if (res.code === "oversell") {
        setProblem(`Only ${formatQty(res.remaining)} ${res.unit} of ${res.item} left. Reduce the quantity.`);
      } else {
        setProblem("Check the buyer, quantities and rates, then try again.");
      }
    } catch {
      setFailed(true);
    }
    setSubmitting(false);
  };

  const label = (s: (typeof stock)[number]) =>
    `${s.item} · ${formatQty(s.remaining)} ${s.unit} left · ${s.source.kind === "agent" ? `Agent ${s.source.saleNo}` : s.source.seller}`;

  return (
    <Card className="gap-0 p-0 [--card-spacing:--spacing(6)]">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="flex flex-col gap-6 p-6"
      >
        <FormBanner
          message={
            failed
              ? "We couldn't save this bill. Your details are still here. Try again."
              : problem ?? (attempted && !valid ? "Fix the highlighted fields to record this bill." : null)
          }
          action={
            failed ? (
              <Button type="button" variant="outline" onClick={() => void save()} disabled={submitting}>
                Try again
              </Button>
            ) : undefined
          }
        />

        <section className="flex flex-col gap-4 border-b border-border pb-6">
          <h2 className="text-[17px] tracking-[-0.2px] text-foreground">1. Buyer</h2>
          <BuyerPicker value={buyerId} onChange={setBuyerId} error={attempted && !buyerId ? "Choose the buyer." : undefined} disabled={submitting} />
        </section>

        <section className="flex flex-col gap-4 border-b border-border pb-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-[17px] tracking-[-0.2px] text-foreground">2. Goods</h2>
            <p className="text-caption text-muted-foreground">One line per stock line. Several lines can go on one bill.</p>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="bf-filter" className="text-sm text-foreground">Search stock</label>
            <Input id="bf-filter" data-page-search value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Item, seller or source" title="Search (/)" aria-keyshortcuts="/" autoComplete="off" disabled={submitting} />
          </div>
          <ul className="flex flex-col gap-4">
            {calc.map((c, i) => {
              const taken = new Set(lines.filter((x) => x.key !== c.l.key).map((x) => x.stockId));
              const options = open.filter((s) => !taken.has(s.id) && (s.id === c.l.stockId || !text || label(s).toLowerCase().includes(text)));
              // Quantity problems (like selling more than is left) show as soon as a quantity is typed.
              const e = { ...(attempted ? c.errors : {}), qty: attempted || c.l.qty ? c.errors.qty : undefined };
              return (
                <li key={c.l.key} className="flex flex-col gap-4 rounded-card border border-border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-foreground">Line {i + 1}</p>
                    {lines.length > 1 && (
                      <Button type="button" variant="ghost" size="sm" aria-label={`Remove line ${i + 1}`} onClick={() => setLines((ls) => ls.filter((x) => x.key !== c.l.key))} disabled={submitting}>
                        <Trash2Icon aria-hidden="true" />
                        Remove
                      </Button>
                    )}
                  </div>
                  <SelectField
                    id={`bf-stock-${c.l.key}`}
                    label="Stock line"
                    required
                    value={c.l.stockId}
                    onChange={(v) => setLine(c.l.key, { stockId: v, qty: "" })}
                    error={e.stock}
                    disabled={submitting}
                    options={[{ value: "", label: options.length ? "Select stock" : "No stock matches" }, ...options.map((s) => ({ value: s.id, label: label(s) }))]}
                  />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField
                      id={`bf-qty-${c.l.key}`}
                      label={`Quantity${c.s ? ` (${c.s.unit})` : ""}`}
                      required
                      inputMode="decimal"
                      value={c.l.qty}
                      onChange={(v) => setLine(c.l.key, { qty: v })}
                      error={e.qty}
                      hint={c.s && !c.errors.qty && c.l.qty ? `Left after this sale: ${formatQty(c.s.remaining - c.qty)} ${c.s.unit}` : undefined}
                      autoComplete="off"
                      disabled={submitting || !c.s}
                    />
                    <TextField
                      id={`bf-rate-${c.l.key}`}
                      label="Sale rate per unit (₹)"
                      required
                      inputMode="decimal"
                      value={c.l.rate}
                      onChange={(v) => setLine(c.l.key, { rate: v })}
                      error={e.rate}
                      hint={c.s ? `Purchase rate ${formatInr(c.s.rate)}` : undefined}
                      autoComplete="off"
                      disabled={submitting || !c.s}
                    />
                  </div>
                  <p className="flex items-baseline justify-between text-sm">
                    <span className="text-muted-foreground">Goods amount</span>
                    <span className="tabular-nums text-foreground">{c.goods ? formatInr(c.goods) : "—"}</span>
                  </p>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" onClick={() => setLines((ls) => [...ls, blank()])} disabled={submitting || lines.length >= MAX_BILL_LINES}>
              <PlusIcon aria-hidden="true" />
              Add line
            </Button>
            {lines.length >= MAX_BILL_LINES && <p className="text-caption text-muted-foreground">That is the most lines one bill can hold. Save it and start another.</p>}
          </div>
        </section>

        <section className="flex flex-col gap-3 border-b border-border pb-6" aria-labelledby="bf-calc">
          <h2 id="bf-calc" className="text-[17px] tracking-[-0.2px] text-foreground">3. Bill total</h2>
          <dl className="flex flex-col gap-2 rounded-card bg-muted p-4 text-[15px]">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">Goods total</dt>
              <dd className="tabular-nums text-foreground">{formatInr(goodsTotal)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">CESS (admin rate)</dt>
              <dd className="tabular-nums text-foreground">{formatInr(cess)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-t border-border pt-2">
              <dt className="text-foreground">Buyer payable</dt>
              <dd className="text-heading-md font-normal tabular-nums text-foreground">{formatInr(payable)}</dd>
            </div>
          </dl>
          <CessLine amount={cess} className="text-sm text-muted-foreground" />
          <p className="text-caption text-muted-foreground"><CessBasis /></p>
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-[17px] tracking-[-0.2px] text-foreground">Captured automatically</h2>
            <p className="text-caption text-muted-foreground">Filled in by the system and cannot be edited.</p>
          </div>
          <dl className="grid gap-4 sm:grid-cols-3">
            <Item label="Bill number" value={now ? nextBillNo(now) : "—"} />
            <Item label="Date" value={now ? formatStamp(now) : "—"} />
            <Item label="Trader" value={trader} />
          </dl>
        </section>

        <Button type="submit" size="lg" className="w-full sm:w-auto sm:self-end" disabled={!valid || submitting} aria-busy={submitting}>
          {submitting && <Spinner />}
          {submitting ? "Recording" : "Record bill"}
        </Button>
      </form>
    </Card>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="text-[15px] break-words tabular-nums text-foreground">{value}</dd>
    </div>
  );
}
