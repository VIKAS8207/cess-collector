"use client";

import { useState } from "react";
import { overdueDays } from "@/lib/domain/settings";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { SelectField } from "@/components/ui/select-field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { FormBanner } from "@/components/auth/form-banner";
import { TextField } from "@/components/auth/text-field";
import { SideDrawer } from "@/components/gate/side-drawer";
import { useToast } from "@/components/gate/toast";
import { submitCommission, submitPayment } from "@/lib/api/agent";
import { describeCommission, toNum } from "@/lib/domain/agent-math";
import { getParty, overdueSince, partyBalance, partyLedger } from "@/lib/domain/agent-store";
import { type CommissionType, type PayMode } from "@/lib/domain/agent-types";
import { DAY } from "@/lib/domain/types";
import { useStoreVersion } from "@/lib/domain/store";
import { formatInr, formatStamp } from "@/lib/format";
import { useNow } from "@/hooks/use-now";
import { activePayModes } from "@/lib/domain/admin-store";
import { cn } from "cn";

const commissionTypes = [
  { value: "percent", label: "% of sale value" },
  { value: "flat", label: "Flat ₹ per unit" },
  { value: "none", label: "No commission" },
];

export function PartyDrawer({ id, agent, onClose }: { id: string | null; agent: string; onClose: () => void }) {
  useStoreVersion();
  const party = id ? getParty(id) : undefined;
  const balance = party ? partyBalance(party.id) : 0;
  return (
    <SideDrawer
      open={!!party}
      onClose={onClose}
      wide
      title={party?.name ?? ""}
      description={
        party && (
          <>
            <Pill tone="brand">{party.kind === "trader" ? "Trader" : "Seller"}</Pill>
            <span>{party.phone}</span>
            <span className="tabular-nums text-foreground">
              {party.kind === "trader"
                ? balance > 0 ? `Owes you ${formatInr(balance)}` : balance < 0 ? `Advance ${formatInr(-balance)}` : "Settled"
                : balance > 0 ? `You owe ${formatInr(balance)}` : balance < 0 ? `Overpaid ${formatInr(-balance)}` : "Settled"}
            </span>
          </>
        )
      }
    >
      {party && <Body key={party.id} partyId={party.id} agent={agent} />}
    </SideDrawer>
  );
}

function Body({ partyId, agent }: { partyId: string; agent: string }) {
  const party = getParty(partyId)!;
  const toast = useToast();
  const now = useNow(60_000);
  const isTrader = party.kind === "trader";
  const ledger = partyLedger(partyId);
  const since = isTrader ? overdueSince(partyId) : null;
  const overdue = since !== null && now > 0 && now - since > overdueDays() * DAY;

  // payment form
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<PayMode>("cash");
  const [reference, setReference] = useState("");
  const [remark, setRemark] = useState("");
  const [payAttempted, setPayAttempted] = useState(false);
  const [paying, setPaying] = useState(false);
  const amountNum = toNum(amount);
  const amountError = Number.isNaN(amountNum) || amountNum <= 0 ? "Enter an amount above zero." : undefined;

  const pay = async () => {
    setPayAttempted(true);
    if (amountError || paying) return;
    setPaying(true);
    await submitPayment({ partyId, amount: amountNum, mode, reference: reference.trim(), remark: remark.trim() }, agent);
    setPaying(false);
    toast.push(`${isTrader ? "Received" : "Paid"} ${formatInr(amountNum)}.`);
    setAmount("");
    setReference("");
    setRemark("");
    setPayAttempted(false);
  };

  // commission editor
  const [type, setType] = useState<CommissionType>(party.commission.type);
  const [rate, setRate] = useState(String(party.commission.rate || ""));
  const [savingRate, setSavingRate] = useState(false);
  const rateNum = type === "none" ? 0 : toNum(rate);
  const rateError = type !== "none" && (Number.isNaN(rateNum) || rateNum <= 0 || (type === "percent" && rateNum > 100)) ? "Enter a valid rate." : undefined;
  const [rateAttempted, setRateAttempted] = useState(false);

  const saveRate = async () => {
    setRateAttempted(true);
    if (rateError || savingRate) return;
    setSavingRate(true);
    await submitCommission(partyId, { type, rate: rateNum });
    setSavingRate(false);
    setRateAttempted(false);
    toast.push(`Commission updated: ${describeCommission({ type, rate: rateNum })}.`);
  };

  return (
    <>
      {overdue && (
        <FormBanner tone="error" message={`Unpaid since ${formatStamp(since!)}. That is over ${overdueDays()} days.`} />
      )}

      <section className="flex flex-col gap-4" aria-labelledby="pd-pay">
        <h3 id="pd-pay" className="text-heading-md text-foreground">
          Record payment
        </h3>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void pay();
          }}
        >
          <p className="text-sm text-muted-foreground">
            Direction: <span className="text-foreground">{isTrader ? "Received from trader" : "Paid to seller"}</span>
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id="pd-amount"
              label="Amount (₹)"
              required
              inputMode="decimal"
              value={amount}
              onChange={setAmount}
              error={payAttempted ? amountError : undefined}
              hint="Part payment is fine."
              autoComplete="off"
              disabled={paying}
            />
            <SelectField id="pd-mode" label="Mode" value={mode} onChange={(v) => setMode(v as PayMode)} options={activePayModes()} disabled={paying} />
          </div>
          <TextField id="pd-ref" label="Reference number" value={reference} onChange={setReference} hint="Optional" autoComplete="off" disabled={paying} />
          <div className="flex flex-col gap-2">
            <label htmlFor="pd-remark" className="text-sm text-foreground">Remark</label>
            <Textarea id="pd-remark" value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="Optional" disabled={paying} />
          </div>
          <Button type="submit" size="lg" className="w-full sm:w-auto sm:self-end" disabled={paying || !!amountError} aria-busy={paying}>
            {paying && <Spinner />}
            Record payment
          </Button>
        </form>
      </section>

      {isTrader && (
        <section className="flex flex-col gap-4" aria-labelledby="pd-com">
          <h3 id="pd-com" className="text-heading-md text-foreground">
            Commission setting
          </h3>
          <p className="text-sm text-muted-foreground">
            Now: <span className="text-foreground">{describeCommission(party.commission)}</span> since{" "}
            {formatStamp(party.commission.since)}. Applies to every new sale to this trader.
          </p>
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void saveRate();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField id="pd-ctype" label="Type" value={type} onChange={(v) => setType(v as CommissionType)} options={commissionTypes} disabled={savingRate} />
              <TextField
                id="pd-crate"
                label={type === "percent" ? "Rate (%)" : "Rate (₹ per unit)"}
                inputMode="decimal"
                value={type === "none" ? "" : rate}
                onChange={setRate}
                disabled={type === "none" || savingRate}
                error={rateAttempted ? rateError : undefined}
                autoComplete="off"
              />
            </div>
            <Button type="submit" variant="outline" className="sm:self-end" disabled={savingRate} aria-busy={savingRate}>
              {savingRate && <Spinner />}
              Update commission
            </Button>
          </form>
          <details className="text-sm">
            <summary className="flex min-h-10 cursor-pointer items-center text-primary">Rate history</summary>
            <ul className="flex flex-col gap-1 pt-2 text-caption text-muted-foreground">
              {[...party.history].reverse().map((h, i) => (
                <li key={i} className="tabular-nums">
                  {describeCommission(h)} · effective from {formatStamp(h.since)}
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}

      <section className="flex flex-col gap-4" aria-labelledby="pd-ledger">
        <h3 id="pd-ledger" className="text-heading-md text-foreground">
          Ledger
        </h3>
        {ledger.length === 0 ? (
          <p className="text-sm text-muted-foreground">No entries yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-[15px]">
              <caption className="sr-only">Ledger with running balance</caption>
              <thead>
                <tr className="h-10 border-b border-border text-left text-caption text-muted-foreground">
                  <th scope="col" className="font-normal">Entry</th>
                  <th scope="col" className="text-right font-normal">Amount</th>
                  <th scope="col" className="text-right font-normal">Balance</th>
                </tr>
              </thead>
              <tbody>
                {[...ledger].reverse().map((e) => (
                  <tr key={e.id} className="border-b border-border align-top">
                    <th scope="row" className="py-3 pr-3 text-left font-normal">
                      <span className="block">{e.label}</span>
                      <span className="block text-caption tabular-nums text-muted-foreground">{formatStamp(e.at)}</span>
                      {e.detail.map((d, i) => (
                        <span key={i} className="block text-caption text-muted-foreground">
                          {d}
                        </span>
                      ))}
                    </th>
                    <td className={cn("py-3 text-right tabular-nums", e.up > 0 ? "text-foreground" : "text-muted-foreground")}>
                      {e.up > 0 ? `+${formatInr(e.up)}` : `-${formatInr(e.down)}`}
                      {e.up > 0 && e.down > 0 && <span className="block text-caption">-{formatInr(e.down)}</span>}
                    </td>
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
