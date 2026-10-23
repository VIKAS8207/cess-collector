"use client";

import { useState } from "react";
import { DownloadIcon, PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { FormBanner } from "@/components/auth/form-banner";
import { TextField } from "@/components/auth/text-field";
import { SideDrawer } from "@/components/gate/side-drawer";
import { useToast } from "@/components/gate/toast";
import { BuyerPill } from "@/components/trader/pills";
import { buyerDetail, submitBuyerPayment } from "@/lib/api/trader";
import { toNum } from "@/lib/domain/agent-math";
import { type PayMode } from "@/lib/domain/agent-types";
import { useStoreVersion } from "@/lib/domain/store";
import { suggestSplit } from "@/lib/domain/trader-math";
import { buyerLedger, getBuyer } from "@/lib/domain/trader-store";
import { formatInr, formatStamp } from "@/lib/format";
import { useNow } from "@/hooks/use-now";
import { activePayModes } from "@/lib/domain/admin-store";
import { cn } from "cn";

export function ledgerCsv(buyerId: string): (string | number)[][] {
  return [
    ["Date", "Entry", "Goods", "CESS", "Balance"],
    ...buyerLedger(buyerId).map((e) => [e.at ? formatStamp(e.at) : "", e.label, e.goods, e.cess, e.balance]),
  ];
}

export function downloadCsv(name: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const url = URL.createObjectURL(new Blob([rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function BuyerDrawer({
  id,
  billId,
  by,
  onClose,
  onPrint,
}: {
  id: string | null;
  billId?: string;
  by: string;
  onClose: () => void;
  onPrint: (id: string) => void;
}) {
  useStoreVersion();
  const now = useNow(60_000);
  const detail = id && now ? buyerDetail(id, now) : null;
  const buyer = id ? getBuyer(id) : undefined;
  return (
    <SideDrawer
      open={!!buyer}
      onClose={onClose}
      wide
      title={buyer?.name ?? ""}
      description={
        detail && (
          <>
            <BuyerPill status={detail.status} />
            <span>{buyer?.phone}</span>
            <span className="tabular-nums text-foreground">Due {formatInr(detail.finance.totalDue)}</span>
          </>
        )
      }
      footer={
        buyer && (
          <>
            <Button variant="outline" onClick={() => onPrint(buyer.id)}>
              <PrinterIcon aria-hidden="true" />
              Print statement
            </Button>
            <Button variant="outline" onClick={() => downloadCsv(`statement-${buyer.name.replace(/\W+/g, "-")}.csv`, ledgerCsv(buyer.id))}>
              <DownloadIcon aria-hidden="true" />
              Export CSV
            </Button>
          </>
        )
      }
    >
      {buyer && <Body key={buyer.id} buyerId={buyer.id} billId={billId} by={by} />}
    </SideDrawer>
  );
}

function Body({ buyerId, billId, by }: { buyerId: string; billId?: string; by: string }) {
  const toast = useToast();
  const ledger = buyerLedger(buyerId);
  const nowMs = useNow(60_000);
  const detail = buyerDetail(buyerId, nowMs)!;
  const { goodsDue, cessDue, totalDue } = detail.finance;

  const [amount, setAmount] = useState("");
  const [goods, setGoods] = useState("");
  const [cess, setCess] = useState("");
  const [mode, setMode] = useState<PayMode>("cash");
  const [reference, setReference] = useState("");
  const [remark, setRemark] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const a = toNum(amount);
  const g = toNum(goods);
  const s = toNum(cess);

  const errors: { amount?: string; split?: string } = {};
  if (Number.isNaN(a) || a <= 0) errors.amount = "Enter the amount received.";
  else if (a > totalDue + 0.005) errors.amount = `That is more than the ${formatInr(totalDue)} due.`;
  if (!errors.amount) {
    const gg = Number.isNaN(g) ? 0 : g;
    const ss = Number.isNaN(s) ? 0 : s;
    const diff = Math.round((a - gg - ss) * 100) / 100;
    if (diff !== 0) errors.split = diff > 0 ? `Goods and CESS parts are ${formatInr(diff)} short of the amount.` : `Goods and CESS parts are ${formatInr(-diff)} over the amount.`;
    else if (gg > goodsDue + 0.005) errors.split = `Goods part is more than the ${formatInr(goodsDue)} goods due.`;
    else if (ss > cessDue + 0.005) errors.split = `CESS part is more than the ${formatInr(cessDue)} CESS due.`;
  }
  const valid = !errors.amount && !errors.split;

  const onAmount = (v: string) => {
    setAmount(v);
    const n = toNum(v);
    if (!Number.isNaN(n) && n > 0) {
      const sp = suggestSplit(Math.min(n, totalDue), goodsDue, cessDue);
      setGoods(String(sp.goods));
      setCess(String(sp.cess));
    } else {
      setGoods("");
      setCess("");
    }
  };

  const suggest = () => {
    if (Number.isNaN(a) || a <= 0) return;
    const sp = suggestSplit(Math.min(a, totalDue), goodsDue, cessDue);
    setGoods(String(sp.goods));
    setCess(String(sp.cess));
  };

  const submit = async () => {
    setAttempted(true);
    if (!valid || saving) return;
    setSaving(true);
    setProblem(null);
    const res = await submitBuyerPayment(
      { buyerId, billId, amount: a, goods: g || 0, cess: s || 0, mode, reference: reference.trim(), remark: remark.trim() },
      by
    );
    setSaving(false);
    if (res.ok) {
      toast.push(`Payment saved: ${formatInr(a)} (goods ${formatInr(g || 0)}, CESS ${formatInr(s || 0)}).`);
      setAmount("");
      setGoods("");
      setCess("");
      setReference("");
      setRemark("");
      setAttempted(false);
    } else setProblem(res.code === "overpay" ? "That is more than the buyer owes." : "Check the goods and CESS split.");
  };

  return (
    <>
      <section className="grid gap-3 rounded-card bg-muted p-4 sm:grid-cols-3" aria-label="Amounts due">
        <Fig label="Goods due" value={goodsDue} />
        <Fig label="CESS due" value={cessDue} />
        <Fig label="Total due" value={totalDue} strong />
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="bu-pay">
        <h3 id="bu-pay" className="text-heading-md text-foreground">Record payment</h3>
        {totalDue <= 0.005 ? (
          <p className="text-sm text-muted-foreground">Nothing is due from this buyer.</p>
        ) : (
          <form noValidate className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <FormBanner message={problem} />
            {billId && <p className="text-caption text-muted-foreground">Linked to the bill you opened.</p>}
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField id="bu-amount" label="Amount received (₹)" required inputMode="decimal" value={amount} onChange={onAmount} error={attempted || amount ? errors.amount : undefined} hint="Part payment is fine." autoComplete="off" disabled={saving} />
              <SelectField id="bu-mode" label="Mode" value={mode} onChange={(v) => setMode(v as PayMode)} options={activePayModes()} disabled={saving} />
            </div>
            <div className="flex flex-col gap-3 rounded-card border border-border p-4">
              <p className="text-sm text-foreground">Split (goods part + CESS part = amount)</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField id="bu-goods" label="Goods part (₹)" inputMode="decimal" value={goods} onChange={setGoods} autoComplete="off" disabled={saving} />
                <TextField id="bu-cess" label="CESS part (₹)" inputMode="decimal" value={cess} onChange={setCess} autoComplete="off" disabled={saving} />
              </div>
              {(attempted || (goods || cess)) && errors.split && <p role="status" className="text-sm text-foreground">{errors.split}</p>}
              <Button type="button" variant="ghost" size="sm" className="self-start" onClick={suggest} disabled={saving}>
                Use proportional split
              </Button>
            </div>
            <TextField id="bu-ref" label="Reference number" value={reference} onChange={setReference} hint="Optional" autoComplete="off" disabled={saving} />
            <div className="flex flex-col gap-2">
              <label htmlFor="bu-remark" className="text-sm text-foreground">Remark</label>
              <Textarea id="bu-remark" value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="Optional" disabled={saving} />
            </div>
            <Button type="submit" size="lg" className="w-full sm:w-auto sm:self-end" disabled={saving || !valid} aria-busy={saving}>
              {saving && <Spinner />}
              Save payment
            </Button>
          </form>
        )}
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="bu-ledger">
        <h3 id="bu-ledger" className="text-heading-md text-foreground">Ledger</h3>
        {ledger.length === 0 ? (
          <p className="text-sm text-muted-foreground">No entries yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-[15px]">
              <caption className="sr-only">Ledger with goods and CESS split and running balance</caption>
              <thead>
                <tr className="h-10 border-b border-border text-left text-caption text-muted-foreground">
                  <th scope="col" className="font-normal">Entry</th>
                  <th scope="col" className="text-right font-normal">Goods</th>
                  <th scope="col" className="text-right font-normal">CESS</th>
                  <th scope="col" className="text-right font-normal">Balance</th>
                </tr>
              </thead>
              <tbody>
                {[...ledger].reverse().map((e) => (
                  <tr key={e.id} className="border-b border-border align-top">
                    <th scope="row" className="py-3 pr-3 text-left font-normal">
                      <span className="block">{e.label}</span>
                      {e.at > 0 && <span className="block text-caption tabular-nums text-muted-foreground">{formatStamp(e.at)}</span>}
                      {e.detail.map((d, i) => (
                        <span key={i} className="block text-caption text-muted-foreground">{d}</span>
                      ))}
                    </th>
                    <td className={cn("py-3 text-right tabular-nums", e.goods < 0 && "text-muted-foreground")}>{e.goods ? `${e.goods > 0 ? "+" : "-"}${formatInr(Math.abs(e.goods))}` : "—"}</td>
                    <td className={cn("py-3 text-right tabular-nums", e.cess < 0 && "text-muted-foreground")}>{e.cess ? `${e.cess > 0 ? "+" : "-"}${formatInr(Math.abs(e.cess))}` : "—"}</td>
                    <td className="py-3 text-right tabular-nums text-foreground">{formatInr(e.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function Fig({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div>
      <p className="text-caption text-muted-foreground">{label}</p>
      <p className={cn("tabular-nums text-foreground", strong ? "text-heading-md" : "text-[17px]")}>{formatInr(value)}</p>
    </div>
  );
}
