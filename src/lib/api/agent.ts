import { delay } from "./delay";
import { activeLabels } from "@/lib/domain/admin-store";
import { overdueDays } from "@/lib/domain/settings";
import { startOfDay } from "@/lib/domain/seed";
import type { Range } from "@/lib/domain/range";
import { DAY, HOUR, type Movement } from "@/lib/domain/types";
import { allMovements, normalizeId } from "@/lib/domain/store";
import {
  BLOCKED_LOG_LIMIT,
  STALE_LOT_MS,
  units,
  type AgentEvent,
  type CommissionSetting,
  type Party,
  type PartyKind,
  type PayMode,
  type Payment,
  type Receipt,
  type Return,
  type Sale,
  type Unit,
} from "@/lib/domain/agent-types";
import {
  allAgentEvents,
  allParties,
  allPayments,
  allReceipts,
  allReturns,
  allSales,
  createParty,
  createPayment,
  createReceipt,
  createReturn,
  createSale,
  getParty,
  isOverdue,
  lineStatus,
  overdueSince,
  partyBalance,
  partyLedger,
  receiptByMovement,
  receiptRemaining,
  receiptStatus,
  saleCommission,
  saleTotal,
  sellers,
  setCommission,
  stockRows,
  sumByUnit,
  traders,
  type LedgerEntry,
  type ReceiptInput,
  type SaleInput,
  type SaleResult,
  type StockRow,
} from "@/lib/domain/agent-store";

type Opts = { forceError?: boolean };
type UnitTotals = Partial<Record<Unit, number>>;

async function sim<T>(opts: Opts | undefined, run: () => T): Promise<T> {
  await delay();
  if (opts?.forceError) throw new Error("simulated failure");
  return run();
}

const inRange = (t: number, r: Range) => t >= r.from && t < r.to;
const pct = (cur: number, prev: number) => (prev === 0 ? null : ((cur - prev) / prev) * 100);

export function dominantUnit(t: UnitTotals): Unit | null {
  let best: Unit | null = null;
  for (const u of units) if ((t[u] ?? 0) > (best ? t[best] ?? 0 : 0)) best = u;
  return best;
}

// ---------- dashboard ----------

export type AgentKpis = {
  vehicles: number;
  vehiclesDelta: number | null;
  received: UnitTotals;
  receivedDelta: number | null;
  sold: UnitTotals;
  soldDelta: number | null;
  lots: number;
  topStock: { item: string; unit: Unit; qty: number } | null;
  commission: number;
  commissionDelta: number | null;
  toReceive: number;
  toPay: number;
};

function commissionNet(from: number, to: number) {
  const gross = allSales().filter((s) => s.at >= from && s.at < to).reduce((a, s) => a + saleCommission(s), 0);
  const back = allReturns().filter((r) => r.at >= from && r.at < to).reduce((a, r) => a + r.commissionReversal, 0);
  return gross - back;
}

export function getAgentKpis(opts?: Opts): Promise<AgentKpis> {
  return sim(opts, () => {
    const now = Date.now();
    const today = startOfDay(now);
    const y = today - DAY;
    const recv = (a: number, b: number) =>
      sumByUnit(allReceipts().filter((r) => r.receivedAt >= a && r.receivedAt < b).flatMap((r) => r.lines.map((l) => ({ unit: l.unit, qty: l.actual }))));
    const sold = (a: number, b: number) =>
      sumByUnit(allSales().filter((s) => s.at >= a && s.at < b).flatMap((s) => s.lines.map((l) => ({ unit: l.unit, qty: l.qty }))));
    const rT = recv(today, today + DAY);
    const rY = recv(y, today);
    const sT = sold(today, today + DAY);
    const sY = sold(y, today);
    const dr = dominantUnit(rT);
    const ds = dominantUnit(sT);
    const open = allReceipts().filter((r) => receiptRemaining(r).length > 0);
    const rows = stockRows().filter((x) => x.stock.remaining > 0).sort((a, b) => b.stock.remaining - a.stock.remaining);
    return {
      vehicles: allReceipts().filter((r) => r.receivedAt >= today).length,
      vehiclesDelta: pct(
        allReceipts().filter((r) => r.receivedAt >= today).length,
        allReceipts().filter((r) => r.receivedAt >= y && r.receivedAt < today).length
      ),
      received: rT,
      receivedDelta: dr && rY[dr] ? pct(rT[dr] ?? 0, rY[dr]!) : null,
      sold: sT,
      soldDelta: ds && sY[ds] ? pct(sT[ds] ?? 0, sY[ds]!) : null,
      lots: open.length,
      topStock: rows[0] ? { item: rows[0].line.item, unit: rows[0].line.unit, qty: rows[0].stock.remaining } : null,
      commission: commissionNet(today, today + DAY),
      commissionDelta: pct(commissionNet(today, today + DAY), commissionNet(y, today)),
      toReceive: traders().reduce((a, t) => a + Math.max(0, partyBalance(t.id)), 0),
      toPay: sellers().reduce((a, s) => a + Math.max(0, partyBalance(s.id)), 0),
    };
  });
}

export type AgentSeries = {
  labels: string[];
  period: string;
  byUnit: Partial<Record<Unit, { received: number[]; sold: number[] }>>;
};

const dayFmt = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short" });
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "a" : "p"}`;

export function getAgentSeries(range: Range, opts?: Opts): Promise<AgentSeries> {
  return sim(opts, () => {
    const byHour = range.to - range.from <= DAY;
    const step = byHour ? HOUR : DAY;
    const n = Math.ceil((range.to - range.from) / step);
    const idx = (t: number) => Math.floor((t - range.from) / step);
    const byUnit: AgentSeries["byUnit"] = {};
    const slot = (u: Unit) => (byUnit[u] ??= { received: new Array(n).fill(0), sold: new Array(n).fill(0) });
    for (const r of allReceipts()) {
      if (!inRange(r.receivedAt, range)) continue;
      for (const l of r.lines) slot(l.unit).received[idx(r.receivedAt)] += l.actual;
    }
    for (const s of allSales()) {
      if (!inRange(s.at, range)) continue;
      for (const l of s.lines) slot(l.unit).sold[idx(s.at)] += l.qty;
    }
    return {
      labels: Array.from({ length: n }, (_, i) => (byHour ? hourLabel(i % 24) : dayFmt.format(range.from + i * DAY))),
      period: byHour ? "By hour" : "By day",
      byUnit,
    };
  });
}

export type WaitingLot = {
  receipt: Receipt;
  summary: string;
  left: string;
};

const qtyText = (n: number) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);

export function itemsSummary(r: Receipt): string {
  return r.lines.map((l) => `${l.item} ${qtyText(l.actual)} ${l.unit}`).join(" + ");
}

export function getWaiting(opts?: Opts): Promise<WaitingLot[]> {
  return sim(opts, () =>
    allReceipts()
      .map((receipt) => ({ receipt, left: receiptRemaining(receipt) }))
      .filter((x) => x.left.length > 0)
      .sort((a, b) => a.receipt.receivedAt - b.receipt.receivedAt)
      .map((x) => ({
        receipt: x.receipt,
        summary: itemsSummary(x.receipt),
        left: x.left.map((y) => `${qtyText(y.stock.remaining)} ${y.line.unit}`).join(" + "),
      }))
  );
}

export type AgentAttention = {
  id: string;
  kind: "mismatch" | "stale" | "overdue" | "blocked";
  title: string;
  detail: string;
  at: number;
  receiptId?: string;
  partyId?: string;
};

export function getAgentAttention(opts?: Opts): Promise<AgentAttention[]> {
  return sim(opts, () => {
    const now = Date.now();
    const out: AgentAttention[] = [];
    for (const r of allReceipts()) {
      if (r.mismatch && now - r.receivedAt < 7 * DAY) {
        out.push({ id: `mm-${r.id}`, kind: "mismatch", title: `${r.plate || r.no} · Quantity mismatch`, detail: `${r.no}: received differs from the challan.`, at: r.receivedAt, receiptId: r.id });
      }
      const sold = allSales().some((s) => s.receiptId === r.id);
      if (!sold && now - r.receivedAt > STALE_LOT_MS) {
        out.push({ id: `st-${r.id}`, kind: "stale", title: `${r.plate || r.no} · No sale yet`, detail: `${r.no} has been unsold for over 24 hours.`, at: r.receivedAt + STALE_LOT_MS, receiptId: r.id });
      }
    }
    for (const t of traders()) {
      if (isOverdue(t.id, now)) {
        const since = overdueSince(t.id)!;
        out.push({ id: `od-${t.id}`, kind: "overdue", title: `${t.name} · Overdue balance`, detail: `Unpaid since ${dayFmt.format(since)}, over ${overdueDays()} days.`, at: since + overdueDays() * DAY, partyId: t.id });
      }
    }
    for (const e of allAgentEvents().filter((x) => x.kind === "blocked").slice(0, BLOCKED_LOG_LIMIT)) {
      out.push({ id: e.id, kind: "blocked", title: "Oversell blocked", detail: e.text, at: e.at, receiptId: e.receiptId, partyId: e.partyId });
    }
    return out.sort((a, b) => b.at - a.at).slice(0, 10);
  });
}

export function getAgentRecent(opts?: Opts): Promise<AgentEvent[]> {
  return sim(opts, () => allAgentEvents().filter((e) => e.kind !== "blocked").slice(0, 10));
}

// ---------- receive goods ----------

export type PickerVehicle = { movement: Movement; receipt?: Receipt };

export function getVehiclesForReceipt(opts?: Opts): Promise<PickerVehicle[]> {
  return sim(opts, () => {
    const today = startOfDay(Date.now());
    const rank = (m: Movement) => (m.status === "Inside" ? 0 : m.status === "Exited" ? 1 : 2);
    return allMovements()
      .filter((m) => m.status === "Inside" || (m.status === "Exited" && (m.exitAt ?? 0) >= today) || (m.status === "Flagged" && !m.flag?.clearedAt))
      .sort((a, b) => rank(a) - rank(b) || (b.entryAt ?? b.createdAt) - (a.entryAt ?? a.createdAt))
      .map((movement) => ({ movement, receipt: receiptByMovement(movement.id) }));
  });
}

export function getTodayReceipts(opts?: Opts): Promise<Receipt[]> {
  return sim(opts, () => {
    const today = startOfDay(Date.now());
    return allReceipts().filter((r) => r.receivedAt >= today).sort((a, b) => b.receivedAt - a.receivedAt);
  });
}

let failNextReceipt = true;
export async function submitReceipt(input: ReceiptInput, by: string) {
  await delay();
  if (input.remark.trim().toUpperCase() === "FAIL" && failNextReceipt) {
    failNextReceipt = false;
    throw new Error("simulated failure");
  }
  failNextReceipt = true;
  return createReceipt(input, by);
}

export function recentItems(): string[] {
  const seen = new Set<string>(activeLabels("items"));
  for (const r of allReceipts()) for (const l of r.lines) seen.add(l.item);
  return [...seen].slice(0, 40);
}

export function statusOfReceipt(r: Receipt) {
  return receiptStatus(r);
}

// ---------- sales ----------

export type StockFilters = { status?: "Waiting" | "Partly sold" | "Sold"; q?: string };

export function getStock(f: StockFilters, opts?: Opts): Promise<StockRow[]> {
  return sim(opts, () => {
    const q = f.q?.trim().toLowerCase() ?? "";
    const qId = normalizeId(q);
    const cutoff = Date.now() - 60 * DAY;
    return stockRows().filter((r) => {
      if (r.receipt.receivedAt < cutoff) return false;
      if (f.status && r.status !== f.status) return false;
      if (q) {
        const hit =
          (qId && normalizeId(r.receipt.plate).includes(qId)) ||
          r.line.item.toLowerCase().includes(q) ||
          r.receipt.no.toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  });
}

export function getSalesHistory(range: Range, q: string, opts?: Opts): Promise<Sale[]> {
  return sim(opts, () => {
    const s = q.trim().toLowerCase();
    const id = normalizeId(s);
    return allSales()
      .filter((x) => inRange(x.at, range))
      .filter(
        (x) =>
          !s ||
          x.partyName.toLowerCase().includes(s) ||
          x.no.toLowerCase().includes(s) ||
          (id && normalizeId(x.plate).includes(id)) ||
          x.lines.some((l) => l.item.toLowerCase().includes(s))
      )
      .sort((a, b) => b.at - a.at);
  });
}

export async function submitSale(input: SaleInput, by: string): Promise<SaleResult> {
  await delay();
  return createSale(input, by);
}

export async function submitReturn(input: { saleId: string; saleLineId: string; qty: number; reason: string }, by: string) {
  await delay();
  return createReturn(input, by);
}

export const listTraders = () => traders().filter((t) => t.active !== false);
export const listSellers = () => sellers();

// ---------- settlements ----------

export type PartyRow = {
  party: Party;
  count: number;
  value: number;
  returns: number;
  commission: number;
  paid: number;
  net: number;
  balance: number;
  overdue: boolean;
};

export type Settlements = { traders: PartyRow[]; sellers: PartyRow[] };

export function getSettlements(range: Range, opts?: Opts): Promise<Settlements> {
  return sim(opts, () => {
    const now = Date.now();
    const sales = allSales().filter((s) => inRange(s.at, range));
    const rets = allReturns().filter((r) => inRange(r.at, range));
    const pays = allPayments().filter((p) => inRange(p.at, range));
    const tRows = traders().map((party): PartyRow => {
      const mine = sales.filter((s) => s.partyId === party.id);
      const value = mine.reduce((a, s) => a + saleTotal(s), 0);
      const returns = rets.filter((r) => r.partyId === party.id).reduce((a, r) => a + r.amount, 0);
      const commission = mine.reduce((a, s) => a + saleCommission(s), 0) - rets.filter((r) => r.partyId === party.id).reduce((a, r) => a + r.commissionReversal, 0);
      const paid = pays.filter((p) => p.partyId === party.id).reduce((a, p) => a + p.amount, 0);
      return { party, count: mine.length, value, returns, commission, paid, net: value - returns, balance: partyBalance(party.id), overdue: isOverdue(party.id, now) };
    });
    const sRows = sellers().map((party): PartyRow => {
      const mine = sales.filter((s) => s.sellerId === party.id);
      const mineIds = new Set(mine.map((s) => s.id));
      const value = mine.reduce((a, s) => a + saleTotal(s), 0);
      const sellerReturns = rets.filter((r) => allSales().find((s) => s.id === r.saleId)?.sellerId === party.id);
      const returns = sellerReturns.reduce((a, r) => a + r.amount, 0);
      const commission = mine.reduce((a, s) => a + saleCommission(s), 0) - sellerReturns.reduce((a, r) => a + r.commissionReversal, 0);
      const paid = pays.filter((p) => p.partyId === party.id).reduce((a, p) => a + p.amount, 0);
      return { party, count: allReceipts().filter((r) => r.sellerId === party.id && inRange(r.receivedAt, range)).length || mineIds.size, value, returns, commission, paid, net: value - returns - commission, balance: partyBalance(party.id), overdue: false };
    });
    return { traders: tRows, sellers: sRows };
  });
}

export type PartyDetail = {
  party: Party;
  ledger: LedgerEntry[];
  balance: number;
  payments: Payment[];
  returns: Return[];
  overdueSince: number | null;
};

export function getPartyDetail(id: string, opts?: Opts): Promise<PartyDetail | null> {
  return sim(opts, () => {
    const party = getParty(id);
    if (!party) return null;
    return {
      party,
      ledger: partyLedger(id),
      balance: partyBalance(id),
      payments: allPayments().filter((p) => p.partyId === id),
      returns: allReturns().filter((r) => r.partyId === id),
      overdueSince: party.kind === "trader" ? overdueSince(id) : null,
    };
  });
}

export async function submitPayment(
  input: { partyId: string; amount: number; mode: PayMode; reference: string; remark: string },
  by: string
) {
  await delay();
  return createPayment(input, by);
}

export async function submitCommission(partyId: string, s: Pick<CommissionSetting, "type" | "rate">) {
  await delay();
  return setCommission(partyId, s);
}

export async function submitParty(input: {
  kind: PartyKind;
  name: string;
  phone: string;
  address: string;
  commission?: Pick<CommissionSetting, "type" | "rate">;
}) {
  await delay();
  return createParty(input);
}

export { allParties, lineStatus, receiptStatus };

// ---------- reports ----------

export type AgentReportKind = "receipts" | "sales" | "commission" | "balances";

export type AgentReportData =
  | { kind: "receipts"; rows: Receipt[]; byItem: { item: string; unit: Unit; qty: number }[] }
  | { kind: "sales"; rows: Sale[]; value: number; commission: number; byDay: { label: string; value: number }[] }
  | { kind: "commission"; rows: { party: Party; value: number; commission: number }[]; total: number }
  | { kind: "balances"; traders: PartyRow[]; sellers: PartyRow[] };

export function getAgentReport(
  kind: AgentReportKind,
  f: { range: Range; partyId?: string },
  opts?: Opts
): Promise<AgentReportData> {
  return sim(opts, (): AgentReportData => {
    const sales = allSales().filter((s) => inRange(s.at, f.range) && (!f.partyId || s.partyId === f.partyId));
    if (kind === "receipts") {
      const rows = allReceipts().filter((r) => inRange(r.receivedAt, f.range)).sort((a, b) => b.receivedAt - a.receivedAt);
      const map = new Map<string, { item: string; unit: Unit; qty: number }>();
      for (const r of rows) for (const l of r.lines) {
        const k = `${l.item}|${l.unit}`;
        const cur = map.get(k) ?? { item: l.item, unit: l.unit, qty: 0 };
        cur.qty += l.actual;
        map.set(k, cur);
      }
      return { kind, rows, byItem: [...map.values()].sort((a, b) => b.qty - a.qty) };
    }
    if (kind === "sales") {
      const days = new Map<number, number>();
      for (const s of sales) {
        const d = startOfDay(s.at);
        days.set(d, (days.get(d) ?? 0) + saleTotal(s));
      }
      return {
        kind,
        rows: sales.sort((a, b) => b.at - a.at),
        value: sales.reduce((a, s) => a + saleTotal(s), 0),
        commission: sales.reduce((a, s) => a + saleCommission(s), 0),
        byDay: [...days].sort((a, b) => a[0] - b[0]).map(([d, value]) => ({ label: dayFmt.format(d), value })),
      };
    }
    if (kind === "commission") {
      const rows = traders()
        .map((party) => {
          const mine = sales.filter((s) => s.partyId === party.id);
          return { party, value: mine.reduce((a, s) => a + saleTotal(s), 0), commission: mine.reduce((a, s) => a + saleCommission(s), 0) };
        })
        .filter((r) => r.value > 0)
        .sort((a, b) => b.commission - a.commission);
      return { kind, rows, total: rows.reduce((a, r) => a + r.commission, 0) };
    }
    const now = Date.now();
    const row = (party: Party): PartyRow => ({ party, count: 0, value: 0, returns: 0, commission: 0, paid: 0, net: 0, balance: partyBalance(party.id), overdue: party.kind === "trader" && isOverdue(party.id, now) });
    return { kind, traders: traders().map(row), sellers: sellers().map(row) };
  });
}
