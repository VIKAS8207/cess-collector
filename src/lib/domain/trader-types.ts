import type { Unit } from "./agent-types";

/** A buyer balance older than this many days counts as overdue. */
export const TRADER_OVERDUE_DAYS = 7;
export const MAX_BILL_LINES = 20;
/** How many blocked oversell attempts show in Needs attention. */
export const TRADER_BLOCKED_LIMIT = 5;
export const CESS_LABEL = "CESS (admin rate)";

export type CessType = "percent" | "flat";

/** One admin-owned config. Traders can read it, never change it. */
export type CessConfig = { enabled: boolean; type: CessType; rate: number; since: number };

export type StockSource =
  | { kind: "agent"; agentName: string; saleNo: string; saleId: string; partyName: string }
  | { kind: "manual"; seller: string; phone: string };

export type ManualPurchase = {
  id: string;
  item: string;
  unit: Unit;
  qty: number;
  rate: number;
  seller: string;
  phone: string;
  date: number;
  remark: string;
};

export type StockAdjustment = {
  id: string;
  stockId: string;
  kind: "wastage" | "return";
  qty: number;
  remark: string;
  at: number;
  by: string;
};

/** Derived view of one purchased line, from agent sales or manual purchases. */
export type StockLine = {
  id: string;
  item: string;
  unit: Unit;
  qty: number;
  rate: number;
  source: StockSource;
  date: number;
  remark: string;
  sold: number;
  returnedByBuyers: number;
  wastage: number;
  returnedToSeller: number;
  remaining: number;
};

export type Buyer = {
  id: string;
  name: string;
  phone: string;
  address: string;
  opening: number;
  /** Trader who owns this buyer. */
  owner?: string;
  active?: boolean;
};

export type BillLine = {
  id: string;
  stockId: string;
  item: string;
  unit: Unit;
  qty: number;
  rate: number;
  goods: number;
  /** This line's share of the bill's cess. */
  cess: number;
};

export type Bill = {
  id: string;
  no: string;
  buyerId: string;
  buyerName: string;
  at: number;
  lines: BillLine[];
  goods: number;
  cess: number;
  payable: number;
  /** CESS rule in force when the bill was made. Later rate changes never touch it. */
  cessBasis?: string;
  by: string;
};

export type BillReturn = {
  id: string;
  billId: string;
  billLineId: string;
  stockId: string;
  buyerId: string;
  item: string;
  unit: Unit;
  qty: number;
  rate: number;
  goodsCredit: number;
  /** CESS taken off what the buyer still owes. */
  cessCredit: number;
  /** CESS already collected that now needs adjusting. */
  cessAdjust: number;
  reason: string;
  at: number;
  by: string;
};

export type BuyerPayment = {
  id: string;
  buyerId: string;
  billId?: string;
  amount: number;
  goods: number;
  cess: number;
  mode: "cash" | "upi" | "bank" | "cheque";
  reference: string;
  remark: string;
  at: number;
  by: string;
};

export type TraderEventKind = "purchase" | "sale" | "return" | "payment" | "blocked";
export type TraderEvent = {
  id: string;
  kind: TraderEventKind;
  at: number;
  text: string;
  billId?: string;
  buyerId?: string;
  stockId?: string;
};

export type TraderData = {
  cess: CessConfig;
  manual: ManualPurchase[];
  adjustments: StockAdjustment[];
  buyers: Buyer[];
  bills: Bill[];
  returns: BillReturn[];
  payments: BuyerPayment[];
  events: TraderEvent[];
};

export type BuyerFinance = {
  opening: number;
  goodsBilled: number;
  cessBilled: number;
  goodsCredit: number;
  cessCredit: number;
  cessAdjust: number;
  goodsPaid: number;
  cessPaid: number;
  goodsDue: number;
  cessDue: number;
  totalDue: number;
  paid: number;
};

export type BillStatus = "Unpaid" | "Partly paid" | "Paid";
