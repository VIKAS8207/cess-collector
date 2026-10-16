"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { SelectField } from "@/components/ui/select-field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { FormBanner } from "@/components/auth/form-banner";
import { TextField } from "@/components/auth/text-field";
import { SideDrawer } from "@/components/gate/side-drawer";
import { useToast } from "@/components/gate/toast";
import { submitReturn } from "@/lib/api/agent";
import { toNum } from "@/lib/domain/agent-math";
import { allPayments, getSale, saleCommission, saleSettlement, saleTotal, soldOnLine, allReturns } from "@/lib/domain/agent-store";
import { useStoreVersion } from "@/lib/domain/store";
import { formatInr, formatQty, formatStamp } from "@/lib/format";

export function SaleDetailDrawer({ id, agent, onClose }: { id: string | null; agent: string; onClose: () => void }) {
  useStoreVersion();
  const sale = id ? getSale(id) : undefined;
  return (
    <SideDrawer
      open={!!sale}
      onClose={onClose}
      wide
      title={sale ? `${sale.no} · ${sale.partyName}` : ""}
      description={
        sale && (
          <>
            <Pill tone={saleSettlement(sale) === "Collected" ? "neutral" : "brand"}>{saleSettlement(sale)}</Pill>
            <span>{sale.receiptNo}</span>
            <span>{sale.plate}</span>
            <span>{formatStamp(sale.at)}</span>
          </>
        )
      }
    >
      {sale && <Body key={sale.id} saleId={sale.id} agent={agent} />}
    </SideDrawer>
  );
}

function Body({ saleId, agent }: { saleId: string; agent: string }) {
  const sale = getSale(saleId)!;
  const toast = useToast();
  const returnable = sale.lines.map((l) => ({ line: l, ...soldOnLine(sale, l) })).filter((x) => x.returnable > 0);
  const [lineId, setLineId] = useState(returnable[0]?.line.id ?? "");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const chosen = returnable.find((x) => x.line.id === lineId) ?? returnable[0];
  const n = toNum(qty);
  const qtyError = Number.isNaN(n) || n <= 0 ? "Enter the quantity returned." : chosen && n > chosen.returnable ? `At most ${formatQty(chosen.returnable)} ${chosen.line.unit} can come back.` : undefined;
  const reasonError = reason.trim() ? undefined : "Enter a reason.";
  const valid = !!chosen && !qtyError && !reasonError;
  const payments = allPayments().filter((p) => p.partyId === sale.partyId).slice(0, 5);
  const returns = allReturns().filter((r) => r.saleId === sale.id);

  const submit = async () => {
    setAttempted(true);
    if (!valid || !chosen || submitting) return;
    setSubmitting(true);
    setProblem(null);
    const res = await submitReturn({ saleId: sale.id, saleLineId: chosen.line.id, qty: n, reason: reason.trim() }, agent);
    setSubmitting(false);
    if (res.ok) {
      toast.push(`Return recorded: ${formatQty(n)} ${chosen.line.unit} ${chosen.line.item}.`);
      setQty("");
      setReason("");
      setAttempted(false);
    } else {
      setProblem("That return could not be recorded. Check the quantity.");
    }
  };

  return (
    <>
      <section className="flex flex-col gap-4" aria-labelledby="sd-lines">
        <h3 id="sd-lines" className="text-heading-md text-foreground">
          Lines
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-[15px]">
            <caption className="sr-only">Sale lines</caption>
            <thead>
              <tr className="h-10 border-b border-border text-left text-caption text-muted-foreground">
                <th scope="col" className="font-normal">Item</th>
                <th scope="col" className="text-right font-normal">Qty</th>
                <th scope="col" className="text-right font-normal">Rate</th>
                <th scope="col" className="text-right font-normal">Amount</th>
                <th scope="col" className="text-right font-normal">Commission</th>
              </tr>
            </thead>
            <tbody>
              {sale.lines.map((l) => (
                <tr key={l.id} className="border-b border-border align-top">
                  <th scope="row" className="py-3 pr-3 text-left font-normal">
                    {l.item}
                    <span className="block text-caption text-muted-foreground">{l.unit}</span>
                  </th>
                  <td className="py-3 text-right tabular-nums">{formatQty(l.qty)}</td>
                  <td className="py-3 text-right tabular-nums">{formatInr(l.rate)}</td>
                  <td className="py-3 text-right tabular-nums">{formatInr(l.amount)}</td>
                  <td className="py-3 text-right tabular-nums">
                    {formatInr(l.commission)}
                    <span className="block text-caption text-muted-foreground">{l.commissionLabel}</span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="h-12">
                <th scope="row" colSpan={3} className="text-left font-normal">
                  Total
                </th>
                <td className="text-right tabular-nums">{formatInr(saleTotal(sale))}</td>
                <td className="text-right tabular-nums">{formatInr(saleCommission(sale))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {returns.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="sd-returns">
          <h3 id="sd-returns" className="text-heading-md text-foreground">
            Returns so far
          </h3>
          <ul className="flex flex-col gap-2 text-sm">
            {returns.map((r) => (
              <li key={r.id} className="flex flex-col">
                <span className="tabular-nums text-foreground">
                  {formatQty(r.qty)} {r.unit} {r.item} · credit {formatInr(r.amount)}
                </span>
                <span className="text-caption text-muted-foreground">
                  {formatStamp(r.at)} · {r.reason}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-4" aria-labelledby="sd-return">
        <h3 id="sd-return" className="text-heading-md text-foreground">
          Record return
        </h3>
        {returnable.length === 0 ? (
          <p className="text-sm text-muted-foreground">Everything on this sale has already come back.</p>
        ) : (
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <FormBanner message={problem} />
            {returnable.length > 1 && (
              <SelectField
                id="rt-line"
                label="Item"
                value={chosen?.line.id ?? ""}
                onChange={setLineId}
                options={returnable.map((x) => ({ value: x.line.id, label: `${x.line.item} (${formatQty(x.returnable)} ${x.line.unit} can return)` }))}
              />
            )}
            <TextField
              id="rt-qty"
              label={`Quantity returned${chosen ? ` (${chosen.line.unit})` : ""}`}
              required
              inputMode="decimal"
              value={qty}
              onChange={setQty}
              error={attempted ? qtyError : undefined}
              hint={chosen ? `Up to ${formatQty(chosen.returnable)} ${chosen.line.unit}` : undefined}
              autoComplete="off"
              disabled={submitting}
            />
            <div className="flex flex-col gap-2">
              <label htmlFor="rt-reason" className="text-sm text-foreground">
                Reason
                <span aria-hidden="true" className="text-destructive"> *</span>
              </label>
              <Textarea id="rt-reason" value={reason} onChange={(e) => setReason(e.target.value)} disabled={submitting} aria-invalid={attempted && !!reasonError} />
              {attempted && reasonError && <p className="text-sm text-foreground">{reasonError}</p>}
            </div>
            <Button type="submit" size="lg" className="w-full sm:w-auto sm:self-end" disabled={!valid || submitting} aria-busy={submitting}>
              {submitting && <Spinner />}
              Record return
            </Button>
          </form>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="sd-pay">
        <h3 id="sd-pay" className="text-heading-md text-foreground">
          Payments from {sale.partyName}
        </h3>
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payments yet.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex items-baseline justify-between gap-3">
                <span className="text-caption text-muted-foreground">
                  {formatStamp(p.at)} · {p.mode}
                  {p.reference ? ` · ${p.reference}` : ""}
                </span>
                <span className="tabular-nums text-foreground">{formatInr(p.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
