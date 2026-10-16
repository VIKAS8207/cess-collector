import { Pill } from "@/components/ui/pill";
import {
  lineStatus,
  receiptHasReturn,
  receiptStatus,
} from "@/lib/domain/agent-store";
import type { LineStatus, Receipt, ReceiptLine } from "@/lib/domain/agent-types";

export function ReceiptPills({ receipt }: { receipt: Receipt }) {
  const status = receiptStatus(receipt);
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Pill tone={status === "Sold" ? "neutral" : "brand"}>{status}</Pill>
      {receipt.mismatch && <Pill tone="danger">Mismatch</Pill>}
      {receiptHasReturn(receipt) && <Pill tone="neutral">Has return</Pill>}
    </span>
  );
}

export function LineStatusPill({ status }: { status: LineStatus }) {
  return <Pill tone={status === "Sold" ? "neutral" : "brand"}>{status === "Waiting" ? "Waiting for sale" : status}</Pill>;
}

export { lineStatus };

/** Match / Mismatch chip for one received line. */
export function MatchChip({ expected, actual }: { expected: number | null; actual: number | null }) {
  if (expected === null || actual === null || Number.isNaN(expected) || Number.isNaN(actual)) {
    return <Pill tone="neutral">No challan</Pill>;
  }
  return expected === actual ? <Pill tone="brand">Match</Pill> : <Pill tone="danger">Mismatch</Pill>;
}

export type { ReceiptLine };
