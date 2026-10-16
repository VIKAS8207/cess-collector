import { commit, db, getMovement } from "./store";
import { overdueDays } from "./settings";
import { commissionFor } from "./agent-math";
import { DAY } from "./types";
import {
  type AgentEvent,
  type AgentEventKind,
  type CommissionSetting,
  type LineStatus,
  type LineStock,
  type Party,
  type PartyKind,
  type PayMode,
  type Payment,
  type Receipt,
  type ReceiptLine,
  type ReceiptStatus,
  type Return,
  type Sale,
  type SaleLine,
  type Unit,
} from "./agent-types";

const uid = () => Math.random().toString(36).slice(2, 9);
const agent = () => db().agent;

// ---------- reads ----------

export const allParties = () => agent().parties;
export const traders = () => agent().parties.filter((p) => p.kind === "trader");
export const sellers = () => agent().parties.filter((p) => p.kind === "seller");
export const getParty = (id: string) => agent().parties.find((p) => p.id === id);
export const allReceipts = () => agent().receipts;
export const getReceipt = (id: string) => agent().receipts.find((r) => r.id === id);
export const receiptByMovement = (movementId: string) =>
  agent().receipts.find((r) => r.movementId === movementId);
export const allSales = () => agent().sales;
export const getSale = (id: string) => agent().sales.find((s) => s.id === id);
export const allReturns = () => agent().returns;
export const allPayments = () => agent().payments;
export const allAgentEvents = () => agent().events;

export function lineStock(receipt: Receipt, line: ReceiptLine): LineStock {
  let sold = 0;
  for (const s of agent().sales) {
    if (s.receiptId !== receipt.id) continue;
    for (const l of s.lines) if (l.receiptLineId === line.id) sold += l.qty;
  }
  let returned = 0;
  for (const x of agent().returns) {
    if (x.receiptId === receipt.id && x.receiptLineId === line.id) returned += x.qty;
  }
  // Returned goods come back into the lot, so they raise the remaining quantity.
  const remaining = line.actual - line.wastage - sold + returned;
  return { received: line.actual, wastage: line.wastage, sold, returned, remaining };
}

export function lineStatus(stock: LineStock): LineStatus {
  if (stock.remaining <= 0) return "Sold";
  return stock.sold > 0 ? "Partly sold" : "Waiting";
}

export function receiptStatus(r: Receipt): ReceiptStatus {
  const stocks = r.lines.map((l) => lineStock(r, l));
  if (stocks.every((s) => s.remaining <= 0)) return "Sold";
  return stocks.some((s) => s.sold > 0) ? "Partly sold" : "Received";
}

export const receiptHasReturn = (r: Receipt) => agent().returns.some((x) => x.receiptId === r.id);

export function receiptRemaining(r: Receipt) {
  return r.lines.map((l) => ({ line: l, stock: lineStock(r, l) })).filter((x) => x.stock.remaining > 0);
}

export type StockRow = { receipt: Receipt; line: ReceiptLine; stock: LineStock; status: LineStatus };

export function stockRows(): StockRow[] {
  const rows: StockRow[] = [];
  for (const receipt of agent().receipts) {
    for (const line of receipt.lines) {
      const stock = lineStock(receipt, line);
      rows.push({ receipt, line, stock, status: lineStatus(stock) });
    }
  }
  return rows.sort((a, b) => b.receipt.receivedAt - a.receipt.receivedAt);
}

export const saleTotal = (s: Sale) => s.lines.reduce((a, l) => a + l.amount, 0);
export const saleCommission = (s: Sale) => s.lines.reduce((a, l) => a + l.commission, 0);

export function soldOnLine(sale: Sale, line: SaleLine) {
  const returned = agent()
    .returns.filter((x) => x.saleId === sale.id && x.saleLineId === line.id)
    .reduce((a, x) => a + x.qty, 0);
  return { returned, returnable: line.qty - returned };
}

export function sumByUnit(rows: { unit: Unit; qty: number }[]): Partial<Record<Unit, number>> {
  const out: Partial<Record<Unit, number>> = {};
  for (const r of rows) out[r.unit] = (out[r.unit] ?? 0) + r.qty;
  return out;
}

// ---------- ledger and balances ----------

export type LedgerEntry = {
  id: string;
  at: number;
  kind: "sale" | "return" | "payment" | "commission";
  label: string;
  detail: string[];
  /** Raises the balance. */
  up: number;
  /** Lowers the balance. */
  down: number;
  balance: number;
};

/**
 * Trader balance = what the trader owes us. Seller balance = what we owe the
 * seller (goods value sold on their behalf, less our commission and payments).
 */
export function partyLedger(partyId: string): LedgerEntry[] {
  const party = getParty(partyId);
  if (!party) return [];
  const raw: Omit<LedgerEntry, "balance">[] = [];
  const d = agent();

  if (party.kind === "trader") {
    for (const s of d.sales.filter((x) => x.partyId === partyId)) {
      raw.push({
        id: s.id, at: s.at, kind: "sale", label: `Sale ${s.no} · ${s.plate || s.receiptNo}`,
        detail: s.lines.map((l) => `${l.item}: ${l.qty} ${l.unit} × ₹${l.rate}`),
        up: saleTotal(s), down: 0,
      });
    }
    for (const x of d.returns.filter((r) => r.partyId === partyId)) {
      raw.push({ id: x.id, at: x.at, kind: "return", label: `Return credit · ${x.item}`, detail: [`${x.qty} ${x.unit} × ₹${x.rate}`, x.reason].filter(Boolean), up: 0, down: x.amount });
    }
    for (const p of d.payments.filter((x) => x.partyId === partyId)) {
      raw.push({ id: p.id, at: p.at, kind: "payment", label: `Payment received · ${p.mode}`, detail: [p.reference && `Ref ${p.reference}`, p.remark].filter(Boolean) as string[], up: 0, down: p.amount });
    }
  } else {
    for (const s of d.sales.filter((x) => x.sellerId === partyId)) {
      raw.push({
        id: s.id, at: s.at, kind: "sale", label: `Sold ${s.no} to ${s.partyName}`,
        detail: s.lines.map((l) => `${l.item}: ${l.qty} ${l.unit} × ₹${l.rate}`),
        up: saleTotal(s), down: 0,
      });
      const c = saleCommission(s);
      if (c > 0) raw.push({ id: `${s.id}-c`, at: s.at, kind: "commission", label: `Commission on ${s.no}`, detail: s.lines.map((l) => l.commissionLabel), up: 0, down: c });
    }
    for (const x of d.returns) {
      const sale = getSale(x.saleId);
      if (sale?.sellerId !== partyId) continue;
      raw.push({ id: x.id, at: x.at, kind: "return", label: `Return · ${x.item}`, detail: [`${x.qty} ${x.unit} × ₹${x.rate}`, x.reason].filter(Boolean), up: x.commissionReversal, down: x.amount });
    }
    for (const p of d.payments.filter((x) => x.partyId === partyId)) {
      raw.push({ id: p.id, at: p.at, kind: "payment", label: `Payment made · ${p.mode}`, detail: [p.reference && `Ref ${p.reference}`, p.remark].filter(Boolean) as string[], up: 0, down: p.amount });
    }
  }

  raw.sort((a, b) => a.at - b.at);
  let bal = 0;
  return raw.map((e) => {
    bal += e.up - e.down;
    return { ...e, balance: Math.round(bal * 100) / 100 };
  });
}

export function partyBalance(partyId: string): number {
  const l = partyLedger(partyId);
  return l.length ? l[l.length - 1].balance : 0;
}

/** When the oldest still-unpaid sale of a trader was made, or null if settled. */
export function overdueSince(traderId: string): number | null {
  const d = agent();
  let credit =
    d.payments.filter((p) => p.partyId === traderId).reduce((a, p) => a + p.amount, 0) +
    d.returns.filter((r) => r.partyId === traderId).reduce((a, r) => a + r.amount, 0);
  const sales = d.sales.filter((s) => s.partyId === traderId).sort((a, b) => a.at - b.at);
  for (const s of sales) {
    const total = saleTotal(s);
    if (credit >= total) credit -= total;
    else return s.at;
  }
  return null;
}

export const isOverdue = (traderId: string, now: number) => {
  const since = overdueSince(traderId);
  return since !== null && now - since > overdueDays() * DAY;
};

// ---------- writes ----------

function log(kind: AgentEventKind, text: string, refs: Partial<AgentEvent> = {}) {
  agent().events.unshift({ id: `ev-${uid()}`, kind, at: Date.now(), text, ...refs });
}

export type ReceiptInput = {
  movementId: string;
  sellerId: string;
  lines: Omit<ReceiptLine, "id">[];
  remark: string;
  flaggedReason?: string;
};

export function createReceipt(input: ReceiptInput, by: string):
  | { ok: true; receipt: Receipt }
  | { ok: false; code: "exists"; receipt: Receipt }
  | { ok: false; code: "no-movement" } {
  const movement = getMovement(input.movementId);
  if (!movement) return { ok: false, code: "no-movement" };
  const existing = receiptByMovement(input.movementId);
  if (existing) return { ok: false, code: "exists", receipt: existing };
  const now = Date.now();
  const n = agent().receipts.length + 1;
  const lines: ReceiptLine[] = input.lines.map((l, i) => ({ ...l, id: `rl-${uid()}-${i}` }));
  const receipt: Receipt = {
    id: `rc-${uid()}`,
    no: `GR-${1000 + n + 40}`,
    movementId: movement.id,
    plate: movement.plate,
    driverName: movement.driverName,
    transporter: movement.transporter,
    entryAt: movement.entryAt,
    sellerId: input.sellerId,
    lines,
    remark: input.remark,
    flaggedReason: input.flaggedReason,
    receivedAt: now,
    agent: by,
    gate: movement.gate,
    mismatch: lines.some((l) => l.expected !== null && l.expected !== l.actual),
  };
  agent().receipts.unshift(receipt);
  log("received", `Received ${movement.plate || movement.fastag}: ${lines.map((l) => l.item).join(", ")}`, { receiptId: receipt.id });
  commit();
  return { ok: true, receipt };
}

export type SaleInput = {
  receiptId: string;
  partyId: string;
  at?: number;
  lines: { receiptLineId: string; qty: number; rate: number }[];
};

export type SaleResult =
  | { ok: true; sale: Sale }
  | { ok: false; code: "oversell"; item: string; remaining: number; unit: Unit }
  | { ok: false; code: "invalid" };

export function createSale(input: SaleInput, by: string): SaleResult {
  const receipt = getReceipt(input.receiptId);
  const party = getParty(input.partyId);
  if (!receipt || !party || party.kind !== "trader" || input.lines.length === 0) return { ok: false, code: "invalid" };

  const built: SaleLine[] = [];
  for (const l of input.lines) {
    const line = receipt.lines.find((x) => x.id === l.receiptLineId);
    if (!line || !(l.qty > 0) || !(l.rate > 0)) return { ok: false, code: "invalid" };
    const remaining = lineStock(receipt, line).remaining;
    if (l.qty > remaining) {
      log("blocked", `Blocked: tried to sell ${l.qty} ${line.unit} ${line.item}, only ${remaining} left`, { receiptId: receipt.id, partyId: party.id });
      commit();
      return { ok: false, code: "oversell", item: line.item, remaining, unit: line.unit };
    }
    const amount = Math.round(l.qty * l.rate * 100) / 100;
    const com = commissionFor(party.commission, l.qty, amount);
    built.push({
      id: `sll-${uid()}`,
      receiptLineId: line.id,
      item: line.item,
      unit: line.unit,
      qty: l.qty,
      rate: l.rate,
      amount,
      commission: com.amount,
      commissionLabel: com.label,
    });
  }
  const n = agent().sales.length + 1;
  const sale: Sale = {
    id: `sl-${uid()}`,
    no: `SL-${1000 + n + 40}`,
    receiptId: receipt.id,
    receiptNo: receipt.no,
    plate: receipt.plate,
    partyId: party.id,
    partyName: party.name,
    sellerId: receipt.sellerId,
    at: input.at ?? Date.now(),
    agent: by,
    lines: built,
  };
  agent().sales.unshift(sale);
  log("sold", `Sold ${built.map((l) => `${l.qty} ${l.unit} ${l.item}`).join(", ")} to ${party.name}`, { saleId: sale.id, receiptId: receipt.id, partyId: party.id });
  commit();
  return { ok: true, sale };
}

export function createReturn(
  input: { saleId: string; saleLineId: string; qty: number; reason: string },
  by: string
): { ok: true; ret: Return } | { ok: false; code: "invalid" | "too-many"; max?: number } {
  const sale = getSale(input.saleId);
  const line = sale?.lines.find((l) => l.id === input.saleLineId);
  if (!sale || !line || !(input.qty > 0)) return { ok: false, code: "invalid" };
  const { returnable } = soldOnLine(sale, line);
  if (input.qty > returnable) return { ok: false, code: "too-many", max: returnable };
  const ret: Return = {
    id: `rt-${uid()}`,
    saleId: sale.id,
    saleLineId: line.id,
    receiptId: sale.receiptId,
    receiptLineId: line.receiptLineId,
    partyId: sale.partyId,
    item: line.item,
    unit: line.unit,
    qty: input.qty,
    rate: line.rate,
    amount: Math.round(input.qty * line.rate * 100) / 100,
    commissionReversal: Math.round(((line.commission * input.qty) / line.qty) * 100) / 100,
    reason: input.reason,
    at: Date.now(),
    by,
  };
  agent().returns.unshift(ret);
  log("returned", `Return ${ret.qty} ${ret.unit} ${ret.item} from ${sale.partyName}`, { saleId: sale.id, receiptId: sale.receiptId, partyId: sale.partyId });
  commit();
  return { ok: true, ret };
}

export function createPayment(
  input: { partyId: string; amount: number; mode: PayMode; reference: string; remark: string },
  by: string
): Payment | null {
  const party = getParty(input.partyId);
  if (!party || !(input.amount > 0)) return null;
  const payment: Payment = {
    id: `pay-${uid()}`,
    partyId: party.id,
    direction: party.kind === "trader" ? "in" : "out",
    amount: input.amount,
    mode: input.mode,
    reference: input.reference,
    remark: input.remark,
    at: Date.now(),
    by,
  };
  agent().payments.unshift(payment);
  log("paid", `${payment.direction === "in" ? "Received" : "Paid"} ₹${input.amount.toLocaleString("en-IN")} ${payment.direction === "in" ? "from" : "to"} ${party.name}`, { partyId: party.id });
  commit();
  return payment;
}

export function setCommission(partyId: string, setting: Pick<CommissionSetting, "type" | "rate">): Party | null {
  const party = getParty(partyId);
  if (!party || party.kind !== "trader") return null;
  const next: CommissionSetting = { ...setting, since: Date.now() };
  party.commission = next;
  party.history = [...party.history, next];
  commit();
  return party;
}

export function createParty(input: {
  kind: PartyKind;
  name: string;
  phone: string;
  address: string;
  commission?: Pick<CommissionSetting, "type" | "rate">;
}): Party {
  const since = Date.now();
  const c: CommissionSetting = { type: input.commission?.type ?? "none", rate: input.commission?.rate ?? 0, since };
  const party: Party = {
    id: `${input.kind === "trader" ? "trd" : "sel"}-${uid()}`,
    kind: input.kind,
    name: input.name,
    phone: input.phone,
    address: input.address,
    commission: c,
    history: input.kind === "trader" ? [c] : [],
  };
  agent().parties.push(party);
  commit();
  return party;
}

/** How much of each sale is covered, paying the oldest sales first (payments and returns count). */
export function saleSettlement(sale: Sale): "Collected" | "Part paid" | "Pending" {
  const d = agent();
  let credit =
    d.payments.filter((p) => p.partyId === sale.partyId).reduce((a, p) => a + p.amount, 0) +
    d.returns.filter((r) => r.partyId === sale.partyId).reduce((a, r) => a + r.amount, 0);
  const ordered = d.sales.filter((s) => s.partyId === sale.partyId).sort((a, b) => a.at - b.at);
  for (const s of ordered) {
    const total = saleTotal(s);
    const covered = Math.min(credit, total);
    credit -= covered;
    if (s.id === sale.id) {
      if (covered >= total) return "Collected";
      return covered > 0 ? "Part paid" : "Pending";
    }
  }
  return "Pending";
}

/** Share of a sale (0 to 1) already covered by payments and returns, oldest sales first. */
export function saleCoverage(sale: Sale): number {
  const d = agent();
  let credit =
    d.payments.filter((p) => p.partyId === sale.partyId).reduce((a, p) => a + p.amount, 0) +
    d.returns.filter((r) => r.partyId === sale.partyId).reduce((a, r) => a + r.amount, 0);
  const ordered = d.sales.filter((s) => s.partyId === sale.partyId).sort((a, b) => a.at - b.at);
  for (const s of ordered) {
    const total = saleTotal(s);
    const covered = Math.min(credit, total);
    credit -= covered;
    if (s.id === sale.id) return total > 0 ? covered / total : 1;
  }
  return 0;
}
