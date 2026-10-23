import { delay } from "./delay";
import { overdueDays } from "@/lib/domain/settings";
import { forcedErrors } from "./gate";
import { startOfDay } from "@/lib/domain/seed";
import type { Range } from "@/lib/domain/range";
import { DAY, HOUR } from "@/lib/domain/types";
import type { Unit } from "@/lib/domain/agent-types";
import { r2 } from "@/lib/domain/trader-math";
import {
  TRADER_BLOCKED_LIMIT,
  type Bill,
  type BillStatus,
  type Buyer,
  type BuyerPayment,
  type StockLine,
} from "@/lib/domain/trader-types";
import {
  addAdjustment,
  allBillReturns,
  allBills,
  allBuyerPayments,
  allBuyers,
  allTraderEvents,
  billStatus,
  buyerFinance,
  buyerLedger,
  buyerStatus,
  createBill,
  createBillReturn,
  createBuyer,
  createBuyerPayment,
  createManualPurchase,
  getBuyer,
  isBuyerOverdue,
  stockLines,
  td,
  unpaidSince,
  type BillInput,
  type BuyerStatus,
  type PaymentInput,
  type TraderLedgerEntry,
} from "@/lib/domain/trader-store";

type Opts = { forceError?: boolean };

async function sim<T>(opts: Opts | undefined, run: () => T): Promise<T> {
  await delay();
  if (opts?.forceError) throw new Error("simulated failure");
  return run();
}

const inRange = (t: number, r: Range) => t >= r.from && t < r.to;
const pct = (cur: number, prev: number) => (prev === 0 ? null : ((cur - prev) / prev) * 100);
const dayFmt = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short" });
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "a" : "p"}`;

export const listBuyers = () => allBuyers().filter((b) => b.active !== false);
export const buyerById = getBuyer;
export const buyerFinanceOf = buyerFinance;
export const billStatusOf = billStatus;

function previous(range: Range): Range {
  const len = range.to - range.from;
  return { from: range.from - len, to: range.from };
}

// ---------- dashboard ----------

export type TraderKpis = {
  purchased: number;
  purchasedDelta: number | null;
  sold: number;
  soldDelta: number | null;
  cessComputed: number;
  cessComputedDelta: number | null;
  cessCollected: number;
  cessCollectedDelta: number | null;
  cessPending: number;
  lots: number;
  top: { item: string; unit: Unit; qty: number } | null;
};

function periodTotals(r: Range) {
  return {
    purchased: stockLines().filter((s) => inRange(s.date, r)).reduce((a, s) => a + s.qty * s.rate, 0),
    sold: allBills().filter((b) => inRange(b.at, r)).reduce((a, b) => a + b.goods, 0),
    computed: allBills().filter((b) => inRange(b.at, r)).reduce((a, b) => a + b.cess, 0),
    collected: allBuyerPayments().filter((p) => inRange(p.at, r)).reduce((a, p) => a + p.cess, 0),
  };
}

export function getTraderKpis(range: Range, opts?: Opts): Promise<TraderKpis> {
  return sim(opts, () => {
    const cur = periodTotals(range);
    const prev = periodTotals(previous(range));
    const open = stockLines().filter((s) => s.remaining > 0);
    const top = [...open].sort((a, b) => b.remaining - a.remaining)[0];
    return {
      purchased: cur.purchased,
      purchasedDelta: pct(cur.purchased, prev.purchased),
      sold: cur.sold,
      soldDelta: pct(cur.sold, prev.sold),
      cessComputed: cur.computed,
      cessComputedDelta: pct(cur.computed, prev.computed),
      cessCollected: cur.collected,
      cessCollectedDelta: pct(cur.collected, prev.collected),
      cessPending: allBuyers().reduce((a, b) => a + Math.max(0, buyerFinance(b.id).cessDue), 0),
      lots: open.length,
      top: top ? { item: top.item, unit: top.unit, qty: top.remaining } : null,
    };
  });
}

export type TraderSeries = { labels: string[]; sold: number[]; collected: number[]; period: string };

export function buildTraderSeries(range: Range, bills: Bill[], payments: BuyerPayment[]): TraderSeries {
  const byHour = range.to - range.from <= DAY;
  const step = byHour ? HOUR : DAY;
  const n = Math.ceil((range.to - range.from) / step);
  const sold = new Array<number>(n).fill(0);
  const collected = new Array<number>(n).fill(0);
  const idx = (t: number) => Math.floor((t - range.from) / step);
  for (const b of bills) if (inRange(b.at, range)) sold[idx(b.at)] += b.goods;
  for (const p of payments) if (inRange(p.at, range)) collected[idx(p.at)] += p.cess;
  return {
    labels: Array.from({ length: n }, (_, i) => (byHour ? hourLabel(i % 24) : dayFmt.format(range.from + i * DAY))),
    sold,
    collected,
    period: byHour ? "By hour" : "By day",
  };
}

export function getTraderSeries(range: Range, opts?: Opts): Promise<TraderSeries> {
  return sim(opts, () => buildTraderSeries(range, allBills(), allBuyerPayments()));
}

export function getStockWaiting(opts?: Opts): Promise<StockLine[]> {
  return sim(opts, () => stockLines().filter((s) => s.remaining > 0).sort((a, b) => a.date - b.date));
}

export type PendingRow = {
  buyer: Buyer;
  goodsDue: number;
  cessDue: number;
  totalDue: number;
  since: number | null;
  days: number;
  status: BuyerStatus;
};

function pendingRows(now: number): PendingRow[] {
  return allBuyers()
    .map((buyer): PendingRow => {
      const f = buyerFinance(buyer.id);
      const since = unpaidSince(buyer.id);
      return {
        buyer,
        goodsDue: f.goodsDue,
        cessDue: f.cessDue,
        totalDue: f.totalDue,
        since,
        days: since ? Math.floor((now - since) / DAY) : 0,
        status: buyerStatus(buyer.id, now),
      };
    })
    .filter((r) => r.totalDue > 0.005);
}

export function getPendingCollections(opts?: Opts): Promise<PendingRow[]> {
  return sim(opts, () => pendingRows(Date.now()).sort((a, b) => (a.since ?? Infinity) - (b.since ?? Infinity)));
}

export type TraderAttention = {
  id: string;
  kind: "overdue" | "cess-adjust" | "wastage" | "blocked";
  title: string;
  detail: string;
  at: number;
  buyerId?: string;
  stockId?: string;
  billId?: string;
};

export function getTraderAttention(opts?: Opts): Promise<TraderAttention[]> {
  return sim(opts, () => {
    const now = Date.now();
    const out: TraderAttention[] = [];
    for (const b of allBuyers()) {
      if (isBuyerOverdue(b.id, now)) {
        const since = unpaidSince(b.id)!;
        out.push({ id: `od-${b.id}`, kind: "overdue", title: `${b.name} · Overdue`, detail: `Unpaid since ${dayFmt.format(since)}, over ${overdueDays()} days.`, at: since + overdueDays() * DAY, buyerId: b.id });
      }
    }
    for (const r of allBillReturns().filter((x) => x.cessAdjust > 0)) {
      out.push({ id: `sa-${r.id}`, kind: "cess-adjust", title: `${buyerById(r.buyerId)?.name ?? "Buyer"} · CESS adjustment pending`, detail: `Return of ${r.item} left ₹${r.cessAdjust} of collected CESS to adjust.`, at: r.at, buyerId: r.buyerId, billId: r.billId });
    }
    for (const s of stockLines().filter((x) => x.wastage > 0)) {
      out.push({ id: `ws-${s.id}`, kind: "wastage", title: `${s.item} · Wastage`, detail: `${s.wastage} ${s.unit} written off.`, at: s.date, stockId: s.id });
    }
    for (const e of allTraderEvents().filter((x) => x.kind === "blocked").slice(0, TRADER_BLOCKED_LIMIT)) {
      out.push({ id: e.id, kind: "blocked", title: "Oversell blocked", detail: e.text, at: e.at, stockId: e.stockId, buyerId: e.buyerId });
    }
    return out.sort((a, b) => b.at - a.at).slice(0, 10);
  });
}

export type TraderFeedItem = { id: string; kind: "purchase" | "sale" | "return" | "payment"; at: number; text: string; billId?: string; buyerId?: string; stockId?: string };

export function getTraderRecent(opts?: Opts): Promise<TraderFeedItem[]> {
  return sim(opts, () => {
    const items: TraderFeedItem[] = allTraderEvents()
      .filter((e) => e.kind !== "blocked")
      .map((e) => ({ id: e.id, kind: e.kind as TraderFeedItem["kind"], at: e.at, text: e.text, billId: e.billId, buyerId: e.buyerId, stockId: e.stockId }));
    for (const s of stockLines().filter((x) => x.source.kind === "agent")) {
      items.push({ id: `pur-${s.id}`, kind: "purchase", at: s.date, text: `Purchased ${s.qty} ${s.unit} ${s.item} via agent ${s.source.kind === "agent" ? s.source.agentName : ""}`, stockId: s.id });
    }
    return items.sort((a, b) => b.at - a.at).slice(0, 10);
  });
}

// ---------- my stock ----------

export type StockFilters = { source?: "agent" | "manual"; status?: "Remaining" | "Fully sold" | "Wastage"; q?: string };

export function stockStatuses(s: StockLine): ("Remaining" | "Fully sold" | "Wastage" | "Returned")[] {
  const out: ("Remaining" | "Fully sold" | "Wastage" | "Returned")[] = [s.remaining > 0 ? "Remaining" : "Fully sold"];
  if (s.wastage > 0) out.push("Wastage");
  if (s.returnedToSeller > 0) out.push("Returned");
  return out;
}

export function getStockList(f: StockFilters, opts?: Opts): Promise<StockLine[]> {
  return sim(opts, () => {
    const q = f.q?.trim().toLowerCase() ?? "";
    return stockLines().filter((s) => {
      if (f.source && s.source.kind !== f.source) return false;
      if (f.status && !stockStatuses(s).includes(f.status)) return false;
      if (q) {
        const seller = s.source.kind === "manual" ? s.source.seller : s.source.agentName + s.source.saleNo + s.source.partyName;
        if (!s.item.toLowerCase().includes(q) && !seller.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  });
}

export async function submitPurchase(
  input: { item: string; unit: Unit; qty: number; rate: number; seller: string; phone: string; date?: number; remark: string },
  by: string
) {
  await delay();
  return createManualPurchase(input, by);
}

export async function submitAdjustment(
  input: { stockId: string; kind: "wastage" | "return"; qty: number; remark: string },
  by: string
) {
  await delay();
  return addAdjustment(input, by);
}

// ---------- sales (bills) ----------

export function getTodayBills(opts?: Opts): Promise<Bill[]> {
  return sim(opts, () => {
    const today = startOfDay(Date.now());
    return allBills().filter((b) => b.at >= today).sort((a, b) => b.at - a.at);
  });
}

export type BillFilters = { range: Range; buyerId?: string; status?: BillStatus; q?: string };

export function getBillHistory(f: BillFilters, opts?: Opts): Promise<Bill[]> {
  return sim(opts, () => {
    const q = f.q?.trim().toLowerCase() ?? "";
    return allBills()
      .filter((b) => inRange(b.at, f.range))
      .filter((b) => !f.buyerId || b.buyerId === f.buyerId)
      .filter((b) => !f.status || billStatus(b) === f.status)
      .filter((b) => !q || b.no.toLowerCase().includes(q) || b.buyerName.toLowerCase().includes(q) || b.lines.some((l) => l.item.toLowerCase().includes(q)))
      .sort((a, b) => b.at - a.at);
  });
}

let failNextBill = true;
export async function submitBill(input: BillInput, by: string) {
  await delay();
  // Demo: open the page with ?error=bill to see one save failure and the retry path.
  if (forcedErrors().has("bill") && failNextBill) {
    failNextBill = false;
    throw new Error("simulated failure");
  }
  failNextBill = true;
  return createBill({ buyerId: input.buyerId, lines: input.lines }, by);
}

export async function submitBillReturn(input: { billId: string; billLineId: string; qty: number; reason: string }, by: string) {
  await delay();
  return createBillReturn(input, by);
}

export async function submitBuyer(input: { name: string; phone: string; address: string; opening: number }, owner?: string) {
  await delay(300, 500);
  return createBuyer(input, owner);
}

// ---------- collections ----------

export type BuyerRow = {
  buyer: Buyer;
  bills: number;
  goodsDue: number;
  cessDue: number;
  totalDue: number;
  paid: number;
  status: BuyerStatus;
};

export type CessSummary = { computed: number; collected: number; pending: number };

export type CollectionsData = { rows: BuyerRow[]; cess: CessSummary };

export function getCollections(range: Range, q: string, opts?: Opts): Promise<CollectionsData> {
  return sim(opts, () => {
    const now = Date.now();
    const text = q.trim().toLowerCase();
    const rows = allBuyers()
      .filter((b) => !text || b.name.toLowerCase().includes(text) || b.phone.includes(text))
      .map((buyer): BuyerRow => {
        const f = buyerFinance(buyer.id);
        return {
          buyer,
          bills: allBills().filter((b) => b.buyerId === buyer.id && inRange(b.at, range)).length,
          goodsDue: f.goodsDue,
          cessDue: f.cessDue,
          totalDue: f.totalDue,
          paid: allBuyerPayments().filter((p) => p.buyerId === buyer.id && inRange(p.at, range)).reduce((a, p) => a + p.amount, 0),
          status: buyerStatus(buyer.id, now),
        };
      });
    const cur = periodTotals(range);
    return {
      rows,
      cess: {
        computed: cur.computed,
        collected: cur.collected,
        pending: allBuyers().reduce((a, b) => a + Math.max(0, buyerFinance(b.id).cessDue), 0),
      },
    };
  });
}

export type CessMovement = { id: string; at: number; buyer: string; label: string; amount: number };

export function getCessMovements(range: Range, kind: "computed" | "collected" | "pending", opts?: Opts): Promise<CessMovement[]> {
  return sim(opts, () => {
    if (kind === "computed")
      return allBills().filter((b) => inRange(b.at, range) && b.cess > 0).map((b) => ({ id: b.id, at: b.at, buyer: b.buyerName, label: `Bill ${b.no}`, amount: b.cess }));
    if (kind === "collected")
      return allBuyerPayments().filter((p) => inRange(p.at, range) && p.cess > 0).map((p) => ({ id: p.id, at: p.at, buyer: getBuyer(p.buyerId)?.name ?? "", label: `Payment · ${p.mode}`, amount: p.cess }));
    return allBuyers()
      .map((b) => ({ id: b.id, at: unpaidSince(b.id) ?? 0, buyer: b.name, label: "CESS still due", amount: buyerFinance(b.id).cessDue }))
      .filter((m) => m.amount > 0.005)
      .sort((a, b) => b.amount - a.amount);
  }).then((rows) => rows.sort((a, b) => b.at - a.at));
}

export type BuyerDetail = { buyer: Buyer; ledger: TraderLedgerEntry[]; finance: ReturnType<typeof buyerFinance>; status: BuyerStatus; payments: BuyerPayment[] };

export function buyerDetail(id: string, now: number): BuyerDetail | null {
  const buyer = getBuyer(id);
  if (!buyer) return null;
  return {
    buyer,
    ledger: buyerLedger(id),
    finance: buyerFinance(id),
    status: buyerStatus(id, now),
    payments: allBuyerPayments().filter((p) => p.buyerId === id),
  };
}

export async function submitBuyerPayment(input: PaymentInput, by: string) {
  await delay();
  return createBuyerPayment(input, by);
}

// ---------- reports ----------

export type TraderReportKind = "purchase-sale" | "cess" | "balances" | "stock";
export type TraderReportFilters = { range: Range; buyerId?: string; item?: string; status?: string };

export type ItemRow = { item: string; unit: Unit; purchased: number; sold: number; returned: number; wastage: number; left: number; valuePurchased: number; valueSold: number; margin: number };
export type DayRow = { label: string; purchased: number; sold: number; margin: number };

export type TraderReportData =
  | { kind: "purchase-sale"; items: ItemRow[]; days: DayRow[]; totals: { purchased: number; sold: number; margin: number } }
  | { kind: "cess"; days: { label: string; computed: number; collected: number; pending: number }[]; buyers: { buyer: Buyer; computed: number; collected: number; pending: number }[]; totals: { computed: number; collected: number; pending: number }; rateNote: string }
  | { kind: "balances"; rows: { buyer: Buyer; opening: number; bills: number; returns: number; payments: number; goodsClosing: number; cessClosing: number; closing: number; overdue: boolean }[] }
  | { kind: "stock"; rows: { line: StockLine; value: number; ageDays: number; flags: string[] }[]; totalValue: number };

export function getTraderReport(kind: TraderReportKind, f: TraderReportFilters, rateNote: string, opts?: Opts): Promise<TraderReportData> {
  return sim(opts, (): TraderReportData => {
    const now = Date.now();
    const itemQ = f.item?.trim().toLowerCase() ?? "";
    const itemOk = (name: string) => !itemQ || name.toLowerCase().includes(itemQ);
    const bills = allBills().filter((b) => inRange(b.at, f.range) && (!f.buyerId || b.buyerId === f.buyerId));
    const pays = allBuyerPayments().filter((p) => inRange(p.at, f.range) && (!f.buyerId || p.buyerId === f.buyerId));
    const stock = stockLines();
    const stockById = new Map(stock.map((s) => [s.id, s]));

    if (kind === "purchase-sale") {
      const keyOf = (item: string, unit: Unit) => `${item}|${unit}`;
      const rows = new Map<string, ItemRow>();
      const row = (item: string, unit: Unit) => {
        const k = keyOf(item, unit);
        if (!rows.has(k)) rows.set(k, { item, unit, purchased: 0, sold: 0, returned: 0, wastage: 0, left: 0, valuePurchased: 0, valueSold: 0, margin: 0 });
        return rows.get(k)!;
      };
      const dayMap = new Map<number, DayRow>();
      const day = (t: number) => {
        const d = startOfDay(t);
        if (!dayMap.has(d)) dayMap.set(d, { label: dayFmt.format(d), purchased: 0, sold: 0, margin: 0 });
        return dayMap.get(d)!;
      };
      for (const s of stock) {
        if (!itemOk(s.item)) continue;
        if (inRange(s.date, f.range)) {
          const r = row(s.item, s.unit);
          r.purchased += s.qty;
          r.valuePurchased += s.qty * s.rate;
          day(s.date).purchased += s.qty * s.rate;
        }
        if (s.remaining > 0) row(s.item, s.unit).left += s.remaining;
      }
      for (const b of bills) for (const l of b.lines) {
        if (!itemOk(l.item)) continue;
        const r = row(l.item, l.unit);
        const buy = stockById.get(l.stockId)?.rate ?? l.rate;
        r.sold += l.qty;
        r.valueSold += l.goods;
        r.margin += (l.rate - buy) * l.qty;
        const d = day(b.at);
        d.sold += l.goods;
        d.margin += (l.rate - buy) * l.qty;
      }
      for (const rt of allBillReturns()) if (inRange(rt.at, f.range) && itemOk(rt.item) && (!f.buyerId || rt.buyerId === f.buyerId)) row(rt.item, rt.unit).returned += rt.qty;
      for (const a of stockAdjustmentsInRange(f.range)) {
        const s = stockById.get(a.stockId);
        if (s && a.kind === "wastage" && itemOk(s.item)) row(s.item, s.unit).wastage += a.qty;
      }
      const items = [...rows.values()].sort((a, b) => b.valueSold - a.valueSold);
      return {
        kind,
        items,
        days: [...dayMap].sort((a, b) => a[0] - b[0]).map(([, v]) => v),
        totals: { purchased: items.reduce((a, i) => a + i.valuePurchased, 0), sold: items.reduce((a, i) => a + i.valueSold, 0), margin: items.reduce((a, i) => a + i.margin, 0) },
      };
    }

    if (kind === "cess") {
      const status = f.status as BillStatus | undefined;
      const sb = status ? bills.filter((b) => billStatus(b) === status) : bills;
      const dayMap = new Map<number, { label: string; computed: number; collected: number; pending: number }>();
      const day = (t: number) => {
        const d = startOfDay(t);
        if (!dayMap.has(d)) dayMap.set(d, { label: dayFmt.format(d), computed: 0, collected: 0, pending: 0 });
        return dayMap.get(d)!;
      };
      for (const b of sb) day(b.at).computed += b.cess;
      for (const p of pays) day(p.at).collected += p.cess;
      for (const d of dayMap.values()) d.pending = r2(d.computed - d.collected);
      const buyers = allBuyers()
        .filter((b) => !f.buyerId || b.id === f.buyerId)
        .map((buyer) => ({
          buyer,
          computed: sb.filter((b) => b.buyerId === buyer.id).reduce((a, b) => a + b.cess, 0),
          collected: pays.filter((p) => p.buyerId === buyer.id).reduce((a, p) => a + p.cess, 0),
          pending: Math.max(0, buyerFinance(buyer.id).cessDue),
        }))
        .filter((b) => b.computed || b.collected || b.pending);
      return {
        kind,
        days: [...dayMap].sort((a, b) => a[0] - b[0]).map(([, v]) => v),
        buyers,
        totals: { computed: buyers.reduce((a, b) => a + b.computed, 0), collected: buyers.reduce((a, b) => a + b.collected, 0), pending: buyers.reduce((a, b) => a + b.pending, 0) },
        rateNote,
      };
    }

    if (kind === "balances") {
      const rows = allBuyers()
        .filter((b) => !f.buyerId || b.id === f.buyerId)
        .map((buyer) => {
          const open = buyerFinance(buyer.id, f.range.from - 1);
          const close = buyerFinance(buyer.id, f.range.to - 1);
          return {
            buyer,
            opening: open.totalDue,
            bills: allBills().filter((b) => b.buyerId === buyer.id && inRange(b.at, f.range)).reduce((a, b) => a + b.payable, 0),
            returns: allBillReturns().filter((r) => r.buyerId === buyer.id && inRange(r.at, f.range)).reduce((a, r) => a + r.goodsCredit + r.cessCredit, 0),
            payments: allBuyerPayments().filter((p) => p.buyerId === buyer.id && inRange(p.at, f.range)).reduce((a, p) => a + p.amount, 0),
            goodsClosing: close.goodsDue,
            cessClosing: close.cessDue,
            closing: close.totalDue,
            overdue: isBuyerOverdue(buyer.id, now),
          };
        })
        .filter((r) => !f.status || (f.status === "Overdue" ? r.overdue : f.status === "Paid" ? r.closing <= 0.005 : r.closing > 0.005));
      return { kind, rows };
    }

    const rows = stock
      .filter((s) => itemOk(s.item))
      .filter((s) => !f.status || stockStatuses(s).includes(f.status as "Remaining"))
      .map((line) => ({
        line,
        value: line.remaining * line.rate,
        ageDays: Math.floor((now - line.date) / DAY),
        flags: stockStatuses(line).filter((x) => x === "Wastage" || x === "Returned"),
      }));
    return { kind: "stock", rows, totalValue: rows.reduce((a, r) => a + r.value, 0) };
  });
}

function stockAdjustmentsInRange(range: Range) {
  return stockLinesAdjustments().filter((a) => inRange(a.at, range));
}

function stockLinesAdjustments() {
  return td().adjustments;
}
