import { commit as commitStore, db } from "./store";
import { overdueDays, cessSettings } from "./settings";
import { allReturns as agentReturns, allSales as agentSales, getParty as agentParty } from "./agent-store";
import { startOfDay } from "./seed";
import { DAY } from "./types";
import type { Unit } from "./agent-types";
import { computeCess, describeCess, r2, splitCess } from "./trader-math";
import { seedTrader } from "./trader-seed";
import {
  MAX_BILL_LINES,
  type Bill,
  type BillLine,
  type BillReturn,
  type BillStatus,
  type Buyer,
  type BuyerFinance,
  type BuyerPayment,
  type ManualPurchase,
  type StockAdjustment,
  type StockLine,
  type TraderData,
  type TraderEvent,
  type TraderEventKind,
} from "./trader-types";

const uid = () => Math.random().toString(36).slice(2, 9);
let seeding = false;
type Opts = { at?: number };

/** The trader database is built on first use, from agent sales plus a little manual history. */
export function td(): TraderData {
  const s = db();
  if (!s.trader) {
    s.trader = {
      cess: { enabled: true, type: "percent", rate: 2, since: startOfDay(Date.now()) - 45 * DAY },
      manual: [],
      adjustments: [],
      buyers: [],
      bills: [],
      returns: [],
      payments: [],
      events: [],
    };
    seeding = true;
    try {
      seedTrader();
    } finally {
      seeding = false;
    }
  }
  return s.trader;
}

const commit = () => {
  if (!seeding) commitStore();
};

function log(kind: TraderEventKind, text: string, at: number, refs: Partial<TraderEvent> = {}) {
  td().events.unshift({ id: `tev-${uid()}`, kind, at, text, ...refs });
}

// ---------- stock ----------

export function stockLines(): StockLine[] {
  const t = td();
  const sold = new Map<string, number>();
  for (const b of t.bills) for (const l of b.lines) sold.set(l.stockId, (sold.get(l.stockId) ?? 0) + l.qty);
  const back = new Map<string, number>();
  for (const r of t.returns) back.set(r.stockId, (back.get(r.stockId) ?? 0) + r.qty);
  const waste = new Map<string, number>();
  const toSeller = new Map<string, number>();
  for (const a of t.adjustments) {
    const m = a.kind === "wastage" ? waste : toSeller;
    m.set(a.stockId, (m.get(a.stockId) ?? 0) + a.qty);
  }

  const finish = (base: Omit<StockLine, "sold" | "returnedByBuyers" | "wastage" | "returnedToSeller" | "remaining">): StockLine => {
    const s = sold.get(base.id) ?? 0;
    const rb = back.get(base.id) ?? 0;
    const w = waste.get(base.id) ?? 0;
    const rs = toSeller.get(base.id) ?? 0;
    return { ...base, sold: s, returnedByBuyers: rb, wastage: w, returnedToSeller: rs, remaining: r2(base.qty - s + rb - w - rs) };
  };

  const lines: StockLine[] = [];
  for (const sale of agentSales()) {
    const party = agentParty(sale.partyId);
    if (!party?.linkedTrader) continue;
    for (const l of sale.lines) {
      const returned = agentReturns()
        .filter((r) => r.saleId === sale.id && r.saleLineId === l.id)
        .reduce((a, r) => a + r.qty, 0);
      const qty = l.qty - returned;
      if (qty <= 0) continue;
      lines.push(
        finish({
          id: `ag-${l.id}`,
          item: l.item,
          unit: l.unit,
          qty,
          rate: l.rate,
          source: { kind: "agent", agentName: sale.agent, saleNo: sale.no, saleId: sale.id, partyName: party.name },
          date: sale.at,
          remark: "",
        })
      );
    }
  }
  for (const m of t.manual) {
    lines.push(
      finish({
        id: m.id,
        item: m.item,
        unit: m.unit,
        qty: m.qty,
        rate: m.rate,
        source: { kind: "manual", seller: m.seller, phone: m.phone },
        date: m.date,
        remark: m.remark,
      })
    );
  }
  return lines.sort((a, b) => b.date - a.date);
}

export const getStockLine = (id: string) => stockLines().find((l) => l.id === id);
export const adjustmentsFor = (stockId: string) => td().adjustments.filter((a) => a.stockId === stockId);
export const billsFromStock = (stockId: string) =>
  td().bills
    .filter((b) => b.lines.some((l) => l.stockId === stockId))
    .map((b) => ({ bill: b, lines: b.lines.filter((l) => l.stockId === stockId) }));

// ---------- buyers, bills, payments ----------

export const allBuyers = () => td().buyers;
export const getBuyer = (id: string) => td().buyers.find((b) => b.id === id);
export const allBills = () => td().bills;
export const getBill = (id: string) => td().bills.find((b) => b.id === id);
export const allBillReturns = () => td().returns;
export const allBuyerPayments = () => td().payments;
export const cessConfig = () => cessSettings();
export const allTraderEvents = () => td().events;

export function buyerFinance(buyerId: string, upTo = Infinity): BuyerFinance {
  const t = td();
  const buyer = getBuyer(buyerId);
  const bills = t.bills.filter((b) => b.buyerId === buyerId && b.at <= upTo);
  const rets = t.returns.filter((r) => r.buyerId === buyerId && r.at <= upTo);
  const pays = t.payments.filter((p) => p.buyerId === buyerId && p.at <= upTo);
  const f = {
    opening: buyer?.opening ?? 0,
    goodsBilled: bills.reduce((a, b) => a + b.goods, 0),
    cessBilled: bills.reduce((a, b) => a + b.cess, 0),
    goodsCredit: rets.reduce((a, r) => a + r.goodsCredit, 0),
    cessCredit: rets.reduce((a, r) => a + r.cessCredit, 0),
    cessAdjust: rets.reduce((a, r) => a + r.cessAdjust, 0),
    goodsPaid: pays.reduce((a, p) => a + p.goods, 0),
    cessPaid: pays.reduce((a, p) => a + p.cess, 0),
  };
  const goodsDue = r2(f.opening + f.goodsBilled - f.goodsCredit - f.goodsPaid);
  const cessDue = r2(f.cessBilled - f.cessCredit - f.cessPaid);
  return { ...f, goodsDue, cessDue, totalDue: r2(goodsDue + cessDue), paid: r2(f.goodsPaid + f.cessPaid) };
}

/** Credit (payments and return credits) is applied to the opening balance, then the oldest bills. */
function coverage(buyerId: string): { opening: number; bills: Map<string, number> } {
  const t = td();
  const buyer = getBuyer(buyerId);
  let credit =
    t.payments.filter((p) => p.buyerId === buyerId).reduce((a, p) => a + p.amount, 0) +
    t.returns.filter((r) => r.buyerId === buyerId).reduce((a, r) => a + r.goodsCredit + r.cessCredit, 0);
  const opening = Math.min(credit, buyer?.opening ?? 0);
  credit -= opening;
  const map = new Map<string, number>();
  for (const b of t.bills.filter((x) => x.buyerId === buyerId).sort((a, b) => a.at - b.at)) {
    const c = Math.min(credit, b.payable);
    map.set(b.id, c);
    credit -= c;
  }
  return { opening, bills: map };
}

export function billStatus(bill: Bill): BillStatus {
  const covered = coverage(bill.buyerId).bills.get(bill.id) ?? 0;
  if (covered >= bill.payable - 0.005) return "Paid";
  return covered > 0 ? "Partly paid" : "Unpaid";
}

/** When the oldest unpaid bill of this buyer was made. */
export function unpaidSince(buyerId: string): number | null {
  const cov = coverage(buyerId).bills;
  const bills = td().bills.filter((b) => b.buyerId === buyerId).sort((a, b) => a.at - b.at);
  for (const b of bills) if ((cov.get(b.id) ?? 0) < b.payable - 0.005) return b.at;
  return null;
}

export function isBuyerOverdue(buyerId: string, now: number) {
  const since = unpaidSince(buyerId);
  return since !== null && now - since > overdueDays() * DAY;
}

export type BuyerStatus = "Paid" | "Partial" | "Unpaid" | "Overdue";
export function buyerStatus(buyerId: string, now: number): BuyerStatus {
  const f = buyerFinance(buyerId);
  if (f.totalDue <= 0.005) return "Paid";
  if (isBuyerOverdue(buyerId, now)) return "Overdue";
  return f.paid > 0 ? "Partial" : "Unpaid";
}

export type TraderLedgerEntry = {
  id: string;
  at: number;
  kind: "opening" | "bill" | "return" | "payment";
  label: string;
  detail: string[];
  /** Signed: bills add, returns and payments subtract. */
  goods: number;
  cess: number;
  balance: number;
};

export function buyerLedger(buyerId: string): TraderLedgerEntry[] {
  const t = td();
  const buyer = getBuyer(buyerId);
  if (!buyer) return [];
  const raw: Omit<TraderLedgerEntry, "balance">[] = [];
  if (buyer.opening > 0) {
    raw.push({ id: `op-${buyer.id}`, at: 0, kind: "opening", label: "Opening balance", detail: [], goods: buyer.opening, cess: 0 });
  }
  for (const b of t.bills.filter((x) => x.buyerId === buyerId)) {
    raw.push({
      id: b.id,
      at: b.at,
      kind: "bill",
      label: `Bill ${b.no}`,
      detail: [...b.lines.map((l) => `${l.item}: ${l.qty} ${l.unit} × ₹${l.rate}`), `Goods ₹${b.goods} + CESS ₹${b.cess}`],
      goods: b.goods,
      cess: b.cess,
    });
  }
  for (const r of t.returns.filter((x) => x.buyerId === buyerId)) {
    raw.push({
      id: r.id,
      at: r.at,
      kind: "return",
      label: `Return credit · ${r.item}`,
      detail: [
        `${r.qty} ${r.unit} × ₹${r.rate}`,
        r.reason,
        ...(r.cessAdjust > 0 ? [`CESS adjustment pending: ₹${r.cessAdjust} (already collected)`] : []),
      ].filter(Boolean),
      goods: -r.goodsCredit,
      cess: -r.cessCredit,
    });
  }
  for (const p of t.payments.filter((x) => x.buyerId === buyerId)) {
    raw.push({
      id: p.id,
      at: p.at,
      kind: "payment",
      label: `Payment received · ${p.mode}`,
      detail: [p.reference && `Ref ${p.reference}`, p.remark].filter(Boolean) as string[],
      goods: -p.goods,
      cess: -p.cess,
    });
  }
  raw.sort((a, b) => a.at - b.at);
  let bal = 0;
  return raw.map((e) => {
    bal += e.goods + e.cess;
    return { ...e, balance: r2(bal) };
  });
}

/** Next bill number for the day of `at`, shown before saving. */
export function nextBillNo(at: number) {
  const d = new Date(at);
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `B${stamp}-${String(bills_by_day_number(at)).padStart(3, "0")}`;
}

export const bills_by_day_number = (at: number) => {
  const start = startOfDay(at);
  return td().bills.filter((b) => b.at >= start && b.at < start + DAY).length + 1;
};

// ---------- writes ----------

export function createBuyer(input: { name: string; phone: string; address: string; opening: number }, owner = "Tara Shah"): Buyer {
  const buyer: Buyer = { id: `by-${uid()}`, ...input, owner, active: true };
  td().buyers.push(buyer);
  commit();
  return buyer;
}

export function createManualPurchase(
  input: Omit<ManualPurchase, "id" | "date"> & { date?: number },
  by: string,
  opts: Opts = {}
): ManualPurchase {
  const at = opts.at ?? Date.now();
  const p: ManualPurchase = { ...input, id: `mp-${uid()}`, date: input.date ?? at };
  td().manual.unshift(p);
  log("purchase", `Purchased ${p.qty} ${p.unit} ${p.item} from ${p.seller}`, p.date, { stockId: p.id });
  void by;
  commit();
  return p;
}

export function addAdjustment(
  input: { stockId: string; kind: "wastage" | "return"; qty: number; remark: string },
  by: string,
  opts: Opts = {}
): { ok: true; adj: StockAdjustment } | { ok: false; code: "too-many" | "invalid"; remaining?: number } {
  const line = getStockLine(input.stockId);
  if (!line || !(input.qty > 0)) return { ok: false, code: "invalid" };
  if (input.qty > line.remaining) return { ok: false, code: "too-many", remaining: line.remaining };
  const at = opts.at ?? Date.now();
  const adj: StockAdjustment = { id: `adj-${uid()}`, ...input, at, by };
  td().adjustments.unshift(adj);
  log("return", `${input.kind === "wastage" ? "Wastage" : "Returned to seller"}: ${input.qty} ${line.unit} ${line.item}`, at, { stockId: line.id });
  commit();
  return { ok: true, adj };
}

export type BillInput = { buyerId: string; lines: { stockId: string; qty: number; rate: number }[] };
export type BillResult =
  | { ok: true; bill: Bill }
  | { ok: false; code: "oversell"; item: string; remaining: number; unit: Unit }
  | { ok: false; code: "invalid" };

export function createBill(input: BillInput, by: string, opts: Opts = {}): BillResult {
  const t = td();
  const buyer = getBuyer(input.buyerId);
  const at = opts.at ?? Date.now();
  if (!buyer || input.lines.length === 0 || input.lines.length > MAX_BILL_LINES) return { ok: false, code: "invalid" };
  const stock = stockLines();
  const seen = new Set<string>();
  const built: Omit<BillLine, "cess">[] = [];
  for (const l of input.lines) {
    const line = stock.find((s) => s.id === l.stockId);
    if (!line || seen.has(l.stockId) || !(l.qty > 0) || !(l.rate > 0)) return { ok: false, code: "invalid" };
    seen.add(l.stockId);
    if (l.qty > line.remaining) {
      log("blocked", `Blocked: tried to sell ${l.qty} ${line.unit} ${line.item}, only ${line.remaining} left`, at, { stockId: line.id, buyerId: buyer.id });
      commit();
      return { ok: false, code: "oversell", item: line.item, remaining: line.remaining, unit: line.unit };
    }
    built.push({ id: `bl-${uid()}`, stockId: line.id, item: line.item, unit: line.unit, qty: l.qty, rate: l.rate, goods: r2(l.qty * l.rate) });
  }
  const cfg = cessConfig();
  const cessParts = splitCess(cfg, built.map((b) => b.goods));
  const lines: BillLine[] = built.map((b, i) => ({ ...b, cess: cessParts[i] }));
  const goods = r2(lines.reduce((a, l) => a + l.goods, 0));
  const cess = computeCess(cfg, goods);
  const bill: Bill = {
    id: `bill-${uid()}`,
    no: nextBillNo(at),
    buyerId: buyer.id,
    buyerName: buyer.name,
    at,
    lines,
    goods,
    cess,
    payable: r2(goods + cess),
    cessBasis: describeCess(cfg),
    by,
  };
  t.bills.unshift(bill);
  log("sale", `Bill ${bill.no} to ${buyer.name}: ${lines.map((l) => `${l.qty} ${l.unit} ${l.item}`).join(", ")}`, at, { billId: bill.id, buyerId: buyer.id });
  commit();
  return { ok: true, bill };
}

export type BillReturnResult =
  | { ok: true; ret: BillReturn }
  | { ok: false; code: "invalid" | "too-many"; max?: number };

export function createBillReturn(
  input: { billId: string; billLineId: string; qty: number; reason: string },
  by: string,
  opts: Opts = {}
): BillReturnResult {
  const t = td();
  const bill = getBill(input.billId);
  const line = bill?.lines.find((l) => l.id === input.billLineId);
  if (!bill || !line || !(input.qty > 0)) return { ok: false, code: "invalid" };
  const already = t.returns.filter((r) => r.billLineId === line.id).reduce((a, r) => a + r.qty, 0);
  const max = line.qty - already;
  if (input.qty > max) return { ok: false, code: "too-many", max };
  const at = opts.at ?? Date.now();
  const share = r2((line.cess * input.qty) / line.qty);
  const fin = buyerFinance(bill.buyerId);
  // CESS still owed is simply reduced. CESS already collected can't be, so it is flagged for adjustment.
  const cessCredit = r2(Math.min(share, Math.max(0, fin.cessDue)));
  const ret: BillReturn = {
    id: `bret-${uid()}`,
    billId: bill.id,
    billLineId: line.id,
    stockId: line.stockId,
    buyerId: bill.buyerId,
    item: line.item,
    unit: line.unit,
    qty: input.qty,
    rate: line.rate,
    goodsCredit: r2(input.qty * line.rate),
    cessCredit,
    cessAdjust: r2(share - cessCredit),
    reason: input.reason,
    at,
    by,
  };
  t.returns.unshift(ret);
  log("return", `Return ${ret.qty} ${ret.unit} ${ret.item} from ${bill.buyerName}`, at, { billId: bill.id, buyerId: bill.buyerId, stockId: line.stockId });
  commit();
  return { ok: true, ret };
}

export type PaymentInput = {
  buyerId: string;
  billId?: string;
  amount: number;
  goods: number;
  cess: number;
  mode: BuyerPayment["mode"];
  reference: string;
  remark: string;
};

export type PaymentResult =
  | { ok: true; payment: BuyerPayment }
  | { ok: false; code: "invalid" | "split" | "overpay" | "part-over" };

export function createBuyerPayment(input: PaymentInput, by: string, opts: Opts = {}): PaymentResult {
  const buyer = getBuyer(input.buyerId);
  if (!buyer || !(input.amount > 0)) return { ok: false, code: "invalid" };
  if (Math.abs(r2(input.goods + input.cess) - r2(input.amount)) > 0.005 || input.goods < 0 || input.cess < 0) return { ok: false, code: "split" };
  const f = buyerFinance(buyer.id);
  if (input.amount > f.totalDue + 0.005) return { ok: false, code: "overpay" };
  if (input.goods > f.goodsDue + 0.005 || input.cess > f.cessDue + 0.005) return { ok: false, code: "part-over" };
  const at = opts.at ?? Date.now();
  const payment: BuyerPayment = { id: `bpay-${uid()}`, ...input, at, by };
  td().payments.unshift(payment);
  log("payment", `Received ₹${input.amount.toLocaleString("en-IN")} from ${buyer.name}`, at, { buyerId: buyer.id, billId: input.billId });
  commit();
  return { ok: true, payment };
}
