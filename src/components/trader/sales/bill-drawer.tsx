"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { FormBanner } from "@/components/auth/form-banner";
import { TextField } from "@/components/auth/text-field";
import { SideDrawer } from "@/components/gate/side-drawer";
import { useToast } from "@/components/gate/toast";
import { BillPill, CessBasis, CessLine } from "@/components/trader/pills";
import { submitBillReturn } from "@/lib/api/trader";
import { toNum } from "@/lib/domain/agent-math";
import { useStoreVersion } from "@/lib/domain/store";
import { allBillReturns, allBuyerPayments, billStatus, getBill } from "@/lib/domain/trader-store";
import { formatInr, formatQty, formatStamp } from "@/lib/format";

export function BillDrawer({ id, by, onClose }: { id: string | null; by: string; onClose: () => void }) {
  useStoreVersion();
  const bill = id ? getBill(id) : undefined;
  return (
    <SideDrawer
      open={!!bill}
      onClose={onClose}
      wide
      title={bill ? `${bill.no} · ${bill.buyerName}` : ""}
      description={
        bill && (
          <>
            <BillPill status={billStatus(bill)} />
            <span>{formatStamp(bill.at)}</span>
          </>
        )
      }
      footer={
        bill && billStatus(bill) !== "Paid" ? (
          <Link href={`/collections?buyer=${bill.buyerId}&bill=${bill.id}`} className={buttonVariants()}>
            Record payment
          </Link>
        ) : undefined
      }
    >
      {bill && <Body key={bill.id} billId={bill.id} by={by} />}
    </SideDrawer>
  );
}

function Body({ billId, by }: { billId: string; by: string }) {
  const bill = getBill(billId)!;
  const toast = useToast();
  const rets = allBillReturns().filter((r) => r.billId === bill.id);
  const returnable = bill.lines
    .map((l) => ({ line: l, left: l.qty - rets.filter((r) => r.billLineId === l.id).reduce((a, r) => a + r.qty, 0) }))
    .filter((x) => x.left > 0);
  const payments = allBuyerPayments().filter((p) => p.buyerId === bill.buyerId).slice(0, 5);

  const [lineId, setLineId] = useState(returnable[0]?.line.id ?? "");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const chosen = returnable.find((x) => x.line.id === lineId) ?? returnable[0];
  const n = toNum(qty);
  const qtyError = Number.isNaN(n) || n <= 0 ? "Enter the quantity returned." : chosen && n > chosen.left ? `At most ${formatQty(chosen.left)} ${chosen.line.unit} can come back.` : undefined;
  const reasonError = reason.trim() ? undefined : "Enter a reason.";
  const valid = !!chosen && !qtyError && !reasonError;

  const submit = async () => {
    setAttempted(true);
    if (!valid || !chosen || saving) return;
    setSaving(true);
    setProblem(null);
    const res = await submitBillReturn({ billId: bill.id, billLineId: chosen.line.id, qty: n, reason: reason.trim() }, by);
    setSaving(false);
    if (res.ok) {
      toast.push(
        res.ret.cessAdjust > 0
          ? `Return recorded. ₹${res.ret.cessAdjust} of CESS was already collected and is flagged for adjustment.`
          : `Return recorded: ${formatQty(n)} ${chosen.line.unit} ${chosen.line.item}.`
      );
      setQty("");
      setReason("");
      setAttempted(false);
    } else setProblem("That return could not be recorded. Check the quantity.");
  };

  return (
    <>
      <section className="flex flex-col gap-4" aria-labelledby="bd-lines">
        <h3 id="bd-lines" className="text-heading-md text-foreground">Lines</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-[15px]">
            <caption className="sr-only">Bill lines</caption>
            <thead>
              <tr className="h-10 border-b border-border text-left text-caption text-muted-foreground">
                <th scope="col" className="font-normal">Item</th>
                <th scope="col" className="text-right font-normal">Qty</th>
                <th scope="col" className="text-right font-normal">Rate</th>
                <th scope="col" className="text-right font-normal">Goods</th>
                <th scope="col" className="text-right font-normal">CESS share</th>
              </tr>
            </thead>
            <tbody>
              {bill.lines.map((l) => (
                <tr key={l.id} className="border-b border-border align-top">
                  <th scope="row" className="py-3 pr-3 text-left font-normal">{l.item}<span className="block text-caption text-muted-foreground">{l.unit}</span></th>
                  <td className="py-3 text-right tabular-nums">{formatQty(l.qty)}</td>
                  <td className="py-3 text-right tabular-nums">{formatInr(l.rate)}</td>
                  <td className="py-3 text-right tabular-nums">{formatInr(l.goods)}</td>
                  <td className="py-3 text-right tabular-nums">{formatInr(l.cess)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="flex flex-col gap-2 rounded-card bg-muted p-4 text-[15px]">
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Goods total</dt><dd className="tabular-nums">{formatInr(bill.goods)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">CESS (admin rate)</dt><dd className="tabular-nums">{formatInr(bill.cess)}</dd></div>
          <div className="flex justify-between gap-3 border-t border-border pt-2"><dt>Buyer payable</dt><dd className="text-heading-md font-normal tabular-nums">{formatInr(bill.payable)}</dd></div>
        </dl>
        <CessLine amount={bill.cess} className="text-sm text-muted-foreground" />
        <p className="text-caption text-muted-foreground"><CessBasis /></p>
      </section>

      {rets.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="bd-rets">
          <h3 id="bd-rets" className="text-heading-md text-foreground">Returns</h3>
          <ul className="flex flex-col gap-2 text-sm">
            {rets.map((r) => (
              <li key={r.id} className="flex flex-col">
                <span className="tabular-nums text-foreground">{formatQty(r.qty)} {r.unit} {r.item} · credit {formatInr(r.goodsCredit + r.cessCredit)}</span>
                <span className="text-caption text-muted-foreground">
                  {formatStamp(r.at)} · {r.reason}
                  {r.cessAdjust > 0 ? ` · CESS adjustment pending ${formatInr(r.cessAdjust)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-4" aria-labelledby="bd-return">
        <h3 id="bd-return" className="text-heading-md text-foreground">Record return</h3>
        {returnable.length === 0 ? (
          <p className="text-sm text-muted-foreground">Everything on this bill has already come back.</p>
        ) : (
          <form noValidate className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <FormBanner message={problem} />
            {returnable.length > 1 && (
              <SelectField id="br-line" label="Item" value={chosen?.line.id ?? ""} onChange={setLineId} options={returnable.map((x) => ({ value: x.line.id, label: `${x.line.item} (${formatQty(x.left)} ${x.line.unit} can return)` }))} />
            )}
            <TextField id="br-qty" label={`Quantity returned${chosen ? ` (${chosen.line.unit})` : ""}`} required inputMode="decimal" value={qty} onChange={setQty} error={attempted ? qtyError : undefined} hint={chosen ? `Up to ${formatQty(chosen.left)} ${chosen.line.unit}` : undefined} autoComplete="off" disabled={saving} />
            <div className="flex flex-col gap-2">
              <label htmlFor="br-reason" className="text-sm text-foreground">Reason<span aria-hidden="true" className="text-destructive"> *</span></label>
              <Textarea id="br-reason" value={reason} onChange={(e) => setReason(e.target.value)} disabled={saving} aria-invalid={attempted && !!reasonError} />
              {attempted && reasonError && <p className="text-sm text-foreground">{reasonError}</p>}
            </div>
            <Button type="submit" variant="outline" className="sm:self-end" disabled={saving} aria-busy={saving}>
              {saving && <Spinner />}
              Record return
            </Button>
          </form>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="bd-pay">
        <h3 id="bd-pay" className="text-heading-md text-foreground">Payments from {bill.buyerName}</h3>
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payments yet.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex items-baseline justify-between gap-3">
                <span className="text-caption text-muted-foreground">{formatStamp(p.at)} · {p.mode} · goods {formatInr(p.goods)}, cess {formatInr(p.cess)}</span>
                <span className="tabular-nums text-foreground">{formatInr(p.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
