import { Pill } from "@/components/ui/pill";
import { describeSaas } from "@/lib/domain/trader-math";
import { saasConfig, type BuyerStatus } from "@/lib/domain/trader-store";
import { SAAS_LABEL, type BillStatus, type StockLine } from "@/lib/domain/trader-types";
import { stockStatuses } from "@/lib/api/trader";
import { formatInr } from "@/lib/format";

export function BillPill({ status }: { status: BillStatus }) {
  return <Pill tone={status === "Paid" ? "neutral" : "brand"}>{status}</Pill>;
}

export function BuyerPill({ status }: { status: BuyerStatus }) {
  const tone = status === "Overdue" ? "danger" : status === "Paid" ? "neutral" : "brand";
  return <Pill tone={tone}>{status}</Pill>;
}

export function StockPills({ line }: { line: StockLine }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {stockStatuses(line).map((s) => (
        <Pill key={s} tone={s === "Remaining" ? "brand" : s === "Wastage" ? "danger" : "neutral"}>
          {s}
        </Pill>
      ))}
    </span>
  );
}

/** The one read-only saas line used on every bill, drawer and form. */
export function SaasLine({ amount, className }: { amount: number; className?: string }) {
  return (
    <p className={className}>
      <span>{SAAS_LABEL}:</span>{" "}
      <span className="tabular-nums text-foreground">{formatInr(amount)}</span>{" "}
      <span className="text-muted-foreground">— fixed by admin</span>
    </p>
  );
}

export function SaasBasis() {
  const cfg = saasConfig();
  return <>Saas config: {describeSaas(cfg)} (fixed by admin)</>;
}
