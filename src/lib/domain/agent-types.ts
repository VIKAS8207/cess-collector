export const units = ["bags", "kg", "quintal", "tonnes", "pieces"] as const;
export type Unit = (typeof units)[number];

/** A trader balance older than this many days counts as overdue. */
export const OVERDUE_DAYS = 7;
/** A lot with no sale this long after receipt needs attention. */
export const STALE_LOT_MS = 24 * 3_600_000;
export const MAX_RECEIPT_LINES = 20;
/** How many blocked oversell attempts show in Needs attention. */
export const BLOCKED_LOG_LIMIT = 5;

export type CommissionType = "percent" | "flat" | "none";
export type CommissionSetting = { type: CommissionType; rate: number; since: number };

export type PartyKind = "trader" | "seller";

export type Party = {
  id: string;
  kind: PartyKind;
  name: string;
  phone: string;
  address: string;
  /** Traders only. Latest entry is the active rate. */
  commission: CommissionSetting;
  history: CommissionSetting[];
  /** Mock flag: buyer has a credit problem. Warns, never blocks. */
  creditBlocked?: boolean;
  /** Mock link: sales to this party show up as purchases for the Trader role. */
  linkedTrader?: boolean;
  active?: boolean;
};

export type ReceiptLine = {
  id: string;
  item: string;
  unit: Unit;
  /** From the challan. null when the agent had no paper to compare with. */
  expected: number | null;
  actual: number;
  wastage: number;
  wastageRemark: string;
};

export type Receipt = {
  id: string;
  no: string;
  movementId: string;
  plate: string;
  driverName: string;
  transporter: string;
  entryAt: number | null;
  sellerId: string;
  lines: ReceiptLine[];
  remark: string;
  flaggedReason?: string;
  receivedAt: number;
  agent: string;
  gate: string;
  mismatch: boolean;
};

export type SaleLine = {
  id: string;
  receiptLineId: string;
  item: string;
  unit: Unit;
  qty: number;
  rate: number;
  amount: number;
  commission: number;
  commissionLabel: string;
};

export type Sale = {
  id: string;
  no: string;
  receiptId: string;
  receiptNo: string;
  plate: string;
  partyId: string;
  partyName: string;
  sellerId: string;
  at: number;
  agent: string;
  lines: SaleLine[];
};

export type Return = {
  id: string;
  saleId: string;
  saleLineId: string;
  receiptId: string;
  receiptLineId: string;
  partyId: string;
  item: string;
  unit: Unit;
  qty: number;
  rate: number;
  amount: number;
  commissionReversal: number;
  reason: string;
  at: number;
  by: string;
};

export type PayMode = "cash" | "upi" | "bank" | "cheque";
export const payModes: { value: PayMode; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "bank", label: "Bank transfer" },
  { value: "cheque", label: "Cheque" },
];

export type Payment = {
  id: string;
  partyId: string;
  direction: "in" | "out";
  amount: number;
  mode: PayMode;
  reference: string;
  remark: string;
  at: number;
  by: string;
};

export type AgentEventKind = "received" | "sold" | "returned" | "paid" | "blocked";
export type AgentEvent = {
  id: string;
  kind: AgentEventKind;
  at: number;
  text: string;
  receiptId?: string;
  saleId?: string;
  partyId?: string;
};

export type AgentData = {
  parties: Party[];
  receipts: Receipt[];
  sales: Sale[];
  returns: Return[];
  payments: Payment[];
  events: AgentEvent[];
};

export type LineStock = {
  received: number;
  wastage: number;
  sold: number;
  returned: number;
  remaining: number;
};

export type LineStatus = "Waiting" | "Partly sold" | "Sold";
export type ReceiptStatus = "Received" | "Partly sold" | "Sold";
