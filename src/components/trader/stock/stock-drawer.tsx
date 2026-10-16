"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { FormBanner } from "@/components/auth/form-banner";
import { TextField } from "@/components/auth/text-field";
import { SideDrawer } from "@/components/gate/side-drawer";
import { useToast } from "@/components/gate/toast";
import { StockPills } from "@/components/trader/pills";
import { submitAdjustment } from "@/lib/api/trader";
import { toNum } from "@/lib/domain/agent-math";
import { useStoreVersion } from "@/lib/domain/store";
import { adjustmentsFor, billsFromStock, getStockLine } from "@/lib/domain/trader-store";
import { formatInr, formatQty, formatStamp } from "@/lib/format";

function Math({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border py-2 text-[15px] last:border-b-0">
      <dt className={strong ? "text-foreground" : "text-muted-foreground"}>{label}</dt>
      <dd className="tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

export function StockDrawer({ id, by, onClose }: { id: string | null; by: string; onClose: () => void }) {
  useStoreVersion();
  const line = id ? getStockLine(id) : undefined;
  return (
    <SideDrawer
      open={!!line}
      onClose={onClose}
      wide
      title={line ? `${line.item} · ${line.unit}` : ""}
      description={line && <StockPills line={line} />}
      footer={
        line && line.remaining > 0 ? (
          <Link href={`/sales?stock=${line.id}`} className={buttonVariants()}>
            Record sale
          </Link>
        ) : undefined
      }
    >
      {line && <Body key={line.id} stockId={line.id} by={by} />}
    </SideDrawer>
  );
}

function Body({ stockId, by }: { stockId: string; by: string }) {
  const line = getStockLine(stockId)!;
  const toast = useToast();
  const adjustments = adjustmentsFor(stockId);
  const sales = billsFromStock(stockId);

  return (
    <>
      <section className="flex flex-col gap-3" aria-labelledby="sk-source">
        <h3 id="sk-source" className="text-heading-md text-foreground">
          Source
        </h3>
        {line.source.kind === "agent" ? (
          <dl className="flex flex-col gap-1 text-[15px]">
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Commission agent</dt><dd>{line.source.agentName}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Agent sale</dt><dd className="tabular-nums">{line.source.saleNo}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Date</dt><dd className="tabular-nums">{formatStamp(line.date)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Purchase rate</dt><dd className="tabular-nums">{formatInr(line.rate)} per {line.unit}</dd></div>
            <p className="pt-2 text-caption text-muted-foreground">Copied from the agent&apos;s record. You cannot edit it.</p>
          </dl>
        ) : (
          <dl className="flex flex-col gap-1 text-[15px]">
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Seller</dt><dd>{line.source.seller}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Date</dt><dd className="tabular-nums">{formatStamp(line.date)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Purchase rate</dt><dd className="tabular-nums">{formatInr(line.rate)} per {line.unit}</dd></div>
            {line.remark && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Remark</dt><dd>{line.remark}</dd></div>}
          </dl>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="sk-math">
        <h3 id="sk-math" className="text-heading-md text-foreground">
          Remaining stock
        </h3>
        <dl>
          <Math label="Purchased" value={`${formatQty(line.qty)} ${line.unit}`} />
          <Math label="Sold" value={`− ${formatQty(line.sold)} ${line.unit}`} />
          <Math label="Returned by buyers" value={`+ ${formatQty(line.returnedByBuyers)} ${line.unit}`} />
          <Math label="Wastage" value={`− ${formatQty(line.wastage)} ${line.unit}`} />
          <Math label="Returned to seller" value={`− ${formatQty(line.returnedToSeller)} ${line.unit}`} />
          <Math strong label="Remaining" value={`${formatQty(line.remaining)} ${line.unit}`} />
        </dl>
      </section>

      <AdjustForm key={`w-${adjustments.length}`} kind="wastage" stockId={stockId} remaining={line.remaining} unit={line.unit} by={by} onDone={(m) => toast.push(m)} />
      <AdjustForm key={`r-${adjustments.length}`} kind="return" stockId={stockId} remaining={line.remaining} unit={line.unit} by={by} onDone={(m) => toast.push(m)} />

      {adjustments.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="sk-adj">
          <h3 id="sk-adj" className="text-heading-md text-foreground">Wastage and returns recorded</h3>
          <ul className="flex flex-col gap-2 text-sm">
            {adjustments.map((a) => (
              <li key={a.id} className="flex flex-col">
                <span className="tabular-nums text-foreground">
                  {a.kind === "wastage" ? "Wastage" : "Returned to seller"} · {formatQty(a.qty)} {line.unit}
                </span>
                <span className="text-caption text-muted-foreground">{formatStamp(a.at)}{a.remark ? ` · ${a.remark}` : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3" aria-labelledby="sk-sales">
        <h3 id="sk-sales" className="text-heading-md text-foreground">Sold from this line</h3>
        {sales.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing sold yet.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {sales.map(({ bill, lines }) => (
              <li key={bill.id} className="flex items-baseline justify-between gap-3">
                <Link href={`/sales?bill=${bill.id}`} className="text-primary hover:underline">
                  {bill.no} · {bill.buyerName}
                </Link>
                <span className="tabular-nums text-foreground">
                  {lines.map((l) => `${formatQty(l.qty)} ${l.unit} × ${formatInr(l.rate)}`).join(", ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function AdjustForm({
  kind,
  stockId,
  remaining,
  unit,
  by,
  onDone,
}: {
  kind: "wastage" | "return";
  stockId: string;
  remaining: number;
  unit: string;
  by: string;
  onDone: (message: string) => void;
}) {
  const isWaste = kind === "wastage";
  const [qty, setQty] = useState("");
  const [remark, setRemark] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const n = toNum(qty);
  const qtyError = Number.isNaN(n) || n <= 0 ? "Enter a quantity." : n > remaining ? `Only ${formatQty(remaining)} ${unit} left.` : undefined;
  const remarkError = !isWaste && !remark.trim() ? "Enter a remark." : undefined;
  const valid = !qtyError && !remarkError;
  const idp = isWaste ? "wst" : "rts";

  const submit = async () => {
    setAttempted(true);
    if (!valid || saving) return;
    setSaving(true);
    setProblem(null);
    const res = await submitAdjustment({ stockId, kind, qty: n, remark: remark.trim() }, by);
    setSaving(false);
    if (res.ok) onDone(isWaste ? `Wastage saved: ${formatQty(n)} ${unit}.` : `Return to seller recorded: ${formatQty(n)} ${unit}.`);
    else setProblem("That could not be saved. Check the quantity.");
  };

  return (
    <section className="flex flex-col gap-4" aria-labelledby={`${idp}-h`}>
      <h3 id={`${idp}-h`} className="text-heading-md text-foreground">
        {isWaste ? "Record wastage" : "Return to seller"}
      </h3>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <FormBanner message={problem} />
        <TextField id={`${idp}-qty`} label={`Quantity (${unit})`} required inputMode="decimal" value={qty} onChange={setQty} error={attempted ? qtyError : undefined} hint={`Up to ${formatQty(remaining)} ${unit}`} autoComplete="off" disabled={saving || remaining <= 0} />
        <div className="flex flex-col gap-2">
          <label htmlFor={`${idp}-remark`} className="text-sm text-foreground">
            Remark{!isWaste && <span aria-hidden="true" className="text-destructive"> *</span>}
          </label>
          <Textarea id={`${idp}-remark`} value={remark} onChange={(e) => setRemark(e.target.value)} disabled={saving} aria-invalid={attempted && !!remarkError} placeholder={isWaste ? "Optional" : undefined} />
          {attempted && remarkError && <p className="text-sm text-foreground">{remarkError}</p>}
        </div>
        <Button type="submit" variant="outline" className="sm:self-end" disabled={saving || remaining <= 0} aria-busy={saving}>
          {saving && <Spinner />}
          {isWaste ? "Save wastage" : "Record return"}
        </Button>
      </form>
    </section>
  );
}
