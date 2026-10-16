import { delay } from "./delay";
import { startOfDay } from "@/lib/domain/seed";
import type { Range } from "@/lib/domain/range";
import { DAY, HOUR, type Movement } from "@/lib/domain/types";
import { allMovements, attentionItems, exceptionItems, openMovements, dwellOf } from "@/lib/domain/store";
import { config, overdueDays, overstayMs, type BusinessInfo } from "@/lib/domain/settings";
import {
  allParties,
  allPayments,
  allReceipts,
  allReturns,
  allSales,
  partyBalance,
  receiptRemaining,
  receiptStatus,
  saleCommission,
  saleCoverage,
  saleTotal,
  getSale,
  isOverdue as agentOverdue,
  overdueSince as agentOverdueSince,
  sellers,
} from "@/lib/domain/agent-store";
import {
  allBills,
  allBuyerPayments,
  allBuyers,
  buyerFinance,
  isBuyerOverdue,
  unpaidSince,
  billStatus,
} from "@/lib/domain/trader-store";
import {
  activityEvents,
  addGate,
  addMaster,
  allMasters,
  allUsers,
  changePartyCommission,
  createUser,
  getUser,
  recentBlockedOtp,
  renameGate,
  revokeOtp,
  saveBusiness,
  saveSaas,
  saveThresholds,
  sendResetOtp,
  setBuyerActive,
  setGateActive,
  setMasterActive,
  setPartyActive,
  setUserActive,
  setUserRole,
  updateBuyer,
  updateMaster,
  userRecordCount,
} from "@/lib/domain/admin-store";
import type { ActivityEvent, ActivityType, AppUser, MasterKind } from "@/lib/domain/admin-types";
import type { CommissionType, Unit } from "@/lib/domain/agent-types";
import { roleLabel, roles, type RoleId } from "@/lib/roles";

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
const prevRange = (r: Range): Range => ({ from: r.from - (r.to - r.from), to: r.from });

// ---------- shared money numbers (dashboard and report must agree) ----------

function avgRates(): Map<string, number> {
  const sum = new Map<string, { amount: number; qty: number }>();
  for (const s of allSales()) for (const l of s.lines) {
    const c = sum.get(l.item) ?? { amount: 0, qty: 0 };
    c.amount += l.amount;
    c.qty += l.qty;
    sum.set(l.item, c);
  }
  return new Map([...sum].map(([k, v]) => [k, v.qty ? v.amount / v.qty : 0]));
}

export type MoneyTotals = {
  receivedValue: number;
  agentSold: number;
  traderSold: number;
  soldValue: number;
  commission: number;
  saasComputed: number;
  saasCollected: number;
};

export function moneyTotals(range: Range): MoneyTotals {
  const rates = avgRates();
  const receivedValue = allReceipts()
    .filter((r) => inRange(r.receivedAt, range))
    .reduce((a, r) => a + r.lines.reduce((b, l) => b + l.actual * (rates.get(l.item) ?? 0), 0), 0);
  const sales = allSales().filter((s) => inRange(s.at, range));
  const bills = allBills().filter((b) => inRange(b.at, range));
  const agentSold = sales.reduce((a, s) => a + saleTotal(s), 0);
  const traderSold = bills.reduce((a, b) => a + b.goods, 0);
  const gross = sales.reduce((a, s) => a + saleCommission(s), 0);
  const back = allReturns().filter((r) => inRange(r.at, range)).reduce((a, r) => a + r.commissionReversal, 0);
  return {
    receivedValue: Math.round(receivedValue),
    agentSold,
    traderSold,
    soldValue: agentSold + traderSold,
    commission: Math.round((gross - back) * 100) / 100,
    saasComputed: bills.reduce((a, b) => a + b.saas, 0),
    saasCollected: allBuyerPayments().filter((p) => inRange(p.at, range)).reduce((a, p) => a + p.saas, 0),
  };
}

// ---------- dashboard ----------

export type AdminKpis = {
  vehiclesIn: number;
  vehiclesOut: number;
  inDelta: number | null;
  money: MoneyTotals;
  receivedDelta: number | null;
  soldDelta: number | null;
  commissionDelta: number | null;
  exceptions: number;
};

function openExceptionCount(now: number) {
  const gate = attentionItems(now).length;
  const mismatch = allReceipts().filter((r) => r.mismatch && now - r.receivedAt < 7 * DAY).length;
  const stale = allBuyers().filter((b) => isBuyerOverdue(b.id, now)).length + allParties().filter((p) => p.kind === "trader" && agentOverdue(p.id, now)).length;
  const adjust = 0;
  return gate + mismatch + stale + adjust;
}

export function getAdminKpis(range: Range, opts?: Opts): Promise<AdminKpis> {
  return sim(opts, () => {
    const m = allMovements();
    const count = (r: Range, key: "entryAt" | "exitAt") => m.filter((x) => x[key] !== null && inRange(x[key]!, r)).length;
    const cur = moneyTotals(range);
    const prev = moneyTotals(prevRange(range));
    return {
      vehiclesIn: count(range, "entryAt"),
      vehiclesOut: count(range, "exitAt"),
      inDelta: pct(count(range, "entryAt"), count(prevRange(range), "entryAt")),
      money: cur,
      receivedDelta: pct(cur.receivedValue, prev.receivedValue),
      soldDelta: pct(cur.soldValue, prev.soldValue),
      commissionDelta: pct(cur.commission, prev.commission),
      exceptions: openExceptionCount(Date.now()),
    };
  });
}

export type AdminSeries = { labels: string[]; period: string; a: number[]; b: number[] };

export function getAdminSeries(range: Range, mode: "gate" | "money", opts?: Opts): Promise<AdminSeries> {
  return sim(opts, () => {
    const byHour = range.to - range.from <= DAY;
    const step = byHour ? HOUR : DAY;
    const n = Math.ceil((range.to - range.from) / step);
    const idx = (t: number) => Math.floor((t - range.from) / step);
    const a = new Array<number>(n).fill(0);
    const b = new Array<number>(n).fill(0);
    if (mode === "gate") {
      for (const mv of allMovements()) {
        if (mv.entryAt !== null && inRange(mv.entryAt, range)) a[idx(mv.entryAt)]++;
        if (mv.exitAt !== null && inRange(mv.exitAt, range)) b[idx(mv.exitAt)]++;
      }
    } else {
      for (const s of allSales()) if (inRange(s.at, range)) a[idx(s.at)] += saleTotal(s);
      for (const x of allBills()) if (inRange(x.at, range)) a[idx(x.at)] += x.goods;
      for (const p of allBuyerPayments()) if (inRange(p.at, range)) b[idx(p.at)] += p.saas;
    }
    return {
      labels: Array.from({ length: n }, (_, i) => (byHour ? hourLabel(i % 24) : dayFmt.format(range.from + i * DAY))),
      period: byHour ? "By hour" : "By day",
      a,
      b,
    };
  });
}

export function getInsideNow(opts?: Opts): Promise<Movement[]> {
  return sim(opts, () => openMovements());
}

export type SettlementRow = { party: { id: string; name: string }; balance: number; since: number | null };

function sellerOldestUnpaid(sellerId: string): number | null {
  const paid = allPayments().filter((p) => p.partyId === sellerId).reduce((a, p) => a + p.amount, 0);
  let credit = paid;
  for (const s of allSales().filter((x) => x.sellerId === sellerId).sort((a, b) => a.at - b.at)) {
    const net = saleTotal(s) - saleCommission(s);
    if (credit >= net) credit -= net;
    else return s.at;
  }
  return null;
}

export function getPendingSettlements(opts?: Opts): Promise<SettlementRow[]> {
  return sim(opts, () =>
    sellers()
      .map((p) => ({ party: { id: p.id, name: p.name }, balance: partyBalance(p.id), since: sellerOldestUnpaid(p.id) }))
      .filter((r) => r.balance > 0.5)
      .sort((a, b) => (a.since ?? Infinity) - (b.since ?? Infinity))
  );
}

export type OverdueBuyer = { id: string; name: string; owner: string; due: number; since: number; days: number };

export function getOverdueBuyers(opts?: Opts): Promise<OverdueBuyer[]> {
  return sim(opts, () => {
    const now = Date.now();
    return allBuyers()
      .filter((b) => isBuyerOverdue(b.id, now))
      .map((b) => {
        const since = unpaidSince(b.id)!;
        return { id: b.id, name: b.name, owner: b.owner ?? "Trader", due: buyerFinance(b.id).totalDue, since, days: Math.floor((now - since) / DAY) };
      })
      .sort((a, b) => a.since - b.since);
  });
}

export type AdminAttention = { id: string; kind: "mismatch" | "overstay" | "otp" | "inactive-user"; title: string; detail: string; at: number };

export function getAdminAttention(opts?: Opts): Promise<AdminAttention[]> {
  return sim(opts, () => {
    const now = Date.now();
    const out: AdminAttention[] = [];
    for (const r of allReceipts()) {
      if (r.mismatch && now - r.receivedAt < 7 * DAY) out.push({ id: `mm-${r.id}`, kind: "mismatch", title: `${r.plate || r.no} · Quantity mismatch`, detail: `${r.no} by ${r.agent}.`, at: r.receivedAt });
    }
    for (const m of openMovements()) {
      const d = dwellOf(m, now);
      if (d !== null && d > overstayMs()) out.push({ id: `os-${m.id}`, kind: "overstay", title: `${m.plate || m.fastag} · Over-stay`, detail: `Inside past ${config.overstayHours} h.`, at: m.entryAt! + overstayMs() });
    }
    for (const b of recentBlockedOtp().filter((x) => now - x.at < DAY)) {
      out.push({ id: `otp-${b.at}`, kind: "otp", title: `${b.name} · Reset OTP resend blocked`, detail: "Asked again before the cooldown ended.", at: b.at });
    }
    for (const u of allUsers().filter((x) => x.status === "inactive")) {
      const open =
        openMovements().filter((m) => m.operator === u.name).length +
        allReceipts().filter((r) => r.agent === u.name && receiptRemaining(r).length > 0).length +
        allBills().filter((b) => b.by === u.name && billStatus(b) !== "Paid").length;
      if (open > 0) out.push({ id: `iu-${u.id}`, kind: "inactive-user", title: `${u.name} · Inactive user`, detail: `Still referenced by ${open} open ${open === 1 ? "record" : "records"}.`, at: u.lastLoginAt ?? u.createdAt });
    }
    return out.sort((a, b) => b.at - a.at).slice(0, 12);
  });
}

export function getAdminRecent(opts?: Opts): Promise<ActivityEvent[]> {
  return sim(opts, () => activityEvents(Date.now()).slice(0, 15));
}

// ---------- users ----------

export type UserRow = { user: AppUser; records: number };

export function getUsers(f: { role?: RoleId; status?: "active" | "inactive"; q?: string }, opts?: Opts): Promise<UserRow[]> {
  return sim(opts, () => {
    const q = f.q?.trim().toLowerCase() ?? "";
    return allUsers()
      .filter((u) => (!f.role || u.role === f.role) && (!f.status || u.status === f.status))
      .filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      .map((user) => ({ user, records: userRecordCount(user) }));
  });
}

export async function submitCreateUser(input: { name: string; email: string; role: RoleId }, admin: string) {
  await delay();
  return createUser(input, admin);
}
export async function submitUserRole(id: string, role: RoleId, admin: string) {
  await delay(300, 500);
  return setUserRole(id, role, admin);
}
export async function submitUserActive(id: string, active: boolean, admin: string) {
  await delay(300, 500);
  return setUserActive(id, active, admin);
}
export async function submitSendOtp(id: string, admin: string) {
  await delay(300, 500);
  return sendResetOtp(id, admin);
}
export async function submitRevokeOtp(id: string, admin: string) {
  await delay(300, 500);
  return revokeOtp(id, admin);
}

export function userAudit(u: AppUser) {
  return activityEvents(Date.now()).filter((e) => e.role === "admin" && e.ref === u.name).slice(0, 5);
}

// ---------- settings ----------

export type SettingsSnapshot = {
  saas: typeof config.saas;
  overstayHours: number;
  overdueDays: number;
  otpCooldownSeconds: number;
  retentionDays: number;
  gates: typeof config.gates;
  business: BusinessInfo;
};

export function getSettings(opts?: Opts): Promise<SettingsSnapshot> {
  return sim(opts, () => ({
    saas: { ...config.saas },
    overstayHours: config.overstayHours,
    overdueDays: config.overdueDays,
    otpCooldownSeconds: config.otpCooldownSeconds,
    retentionDays: config.retentionDays,
    gates: config.gates.map((g) => ({ ...g })),
    business: { ...config.business },
  }));
}

export async function submitSaas(input: { enabled: boolean; type: "percent" | "flat"; rate: number }, admin: string) {
  await delay();
  saveSaas(input, admin);
}
export async function submitThresholds(input: { overstayHours: number; overdueDays: number; otpCooldownSeconds: number }, admin: string) {
  await delay();
  saveThresholds(input, admin);
}
export async function submitAddGate(name: string, admin: string) {
  await delay(300, 500);
  return addGate(name, admin);
}
export async function submitRenameGate(id: string, name: string, admin: string) {
  await delay(300, 500);
  renameGate(id, name, admin);
}
export async function submitGateActive(id: string, active: boolean, admin: string) {
  await delay(300, 500);
  return setGateActive(id, active, admin);
}
export async function submitBusiness(input: BusinessInfo, admin: string) {
  await delay();
  saveBusiness(input, admin);
}

// ---------- masters ----------

export function getMasters(kind: MasterKind, opts?: Opts) {
  return sim(opts, () => allMasters(kind).map((m) => ({ ...m })));
}
export async function submitAddMaster(kind: MasterKind, label: string, unit: Unit | undefined, admin: string) {
  await delay(300, 500);
  return addMaster(kind, label, unit, admin);
}
export async function submitUpdateMaster(id: string, patch: { label?: string; defaultUnit?: Unit }, admin: string) {
  await delay(300, 500);
  updateMaster(id, patch, admin);
}
export async function submitMasterActive(id: string, active: boolean, admin: string) {
  await delay(300, 500);
  setMasterActive(id, active, admin);
}


export function getPartiesAdmin(f: { kind?: "trader" | "seller"; status?: "active" | "inactive"; q?: string }, opts?: Opts) {
  return sim(opts, () => {
    const q = f.q?.trim().toLowerCase() ?? "";
    return allParties()
      .filter((p) => (!f.kind || p.kind === f.kind) && (!f.status || (p.active !== false) === (f.status === "active")))
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.phone.includes(q));
  });
}
export async function submitPartyActive(id: string, active: boolean, admin: string) {
  await delay(300, 500);
  setPartyActive(id, active, admin);
}
export async function submitPartyCommission(id: string, s: { type: CommissionType; rate: number }, admin: string) {
  await delay();
  changePartyCommission(id, s, admin);
}

export function getBuyersAdmin(f: { owner?: string; status?: "active" | "inactive"; q?: string }, opts?: Opts) {
  return sim(opts, () => {
    const q = f.q?.trim().toLowerCase() ?? "";
    return allBuyers()
      .filter((b) => (!f.owner || b.owner === f.owner) && (!f.status || (b.active !== false) === (f.status === "active")))
      .filter((b) => !q || b.name.toLowerCase().includes(q) || b.phone.includes(q));
  });
}
export const buyerOwners = () => [...new Set(allBuyers().map((b) => b.owner ?? "Trader"))];
export async function submitBuyerUpdate(id: string, patch: { name: string; phone: string; address: string }, admin: string) {
  await delay();
  updateBuyer(id, patch, admin);
}
export async function submitBuyerActive(id: string, active: boolean, admin: string) {
  await delay(300, 500);
  setBuyerActive(id, active, admin);
}

// ---------- all activity ----------

export type ActivityFilters = { range: Range; role?: RoleId; user?: string; type?: ActivityType; q?: string };

export function filterActivity(f: ActivityFilters, now: number): ActivityEvent[] {
  const q = f.q?.trim().toLowerCase() ?? "";
  return activityEvents(now).filter((e) => {
    if (!inRange(e.at, f.range)) return false;
    if (f.role && e.role !== f.role) return false;
    if (f.user && e.user !== f.user) return false;
    if (f.type && e.type !== f.type) return false;
    if (q) {
      const hay = `${e.summary} ${e.ref} ${e.payload.map((p) => p[1]).join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function getActivity(f: ActivityFilters, page: number, size: number, opts?: Opts) {
  return sim(opts, () => {
    const rows = filterActivity(f, Date.now());
    const pages = Math.max(1, Math.ceil(rows.length / size));
    const p = Math.min(Math.max(1, page), pages);
    return { rows: rows.slice((p - 1) * size, p * size), total: rows.length, page: p, pages, size };
  });
}

export function activityUsers(): string[] {
  return [...new Set(activityEvents(Date.now()).map((e) => e.user))].sort();
}

// ---------- reports ----------

export type AdminReportKind = "operations" | "money" | "balances" | "users";
export type AdminReportFilters = { range: Range; role?: RoleId; user?: string };

export type AdminReportData =
  | {
      kind: "operations";
      days: { label: string; in: number; out: number; inside: number }[];
      avgDwell: number | null;
      exceptions: { label: string; count: number }[];
      receipts: number;
      lots: { label: string; count: number }[];
    }
  | {
      kind: "money";
      totals: MoneyTotals;
      agents: { name: string; earned: number; collected: number; pending: number }[];
      traders: { name: string; computed: number; collected: number; pending: number }[];
      byRole: { label: string; value: number }[];
      days: { label: string; commission: number; saas: number }[];
    }
  | {
      kind: "balances";
      parties: { id: string; name: string; kind: string; owner: string; balance: number; overdue: boolean }[];
      buyers: { id: string; name: string; owner: string; balance: number; overdue: boolean }[];
    }
  | {
      kind: "users";
      rows: { user: AppUser; entries: number; receipts: number; sales: number; payments: number; lastActive: number | null }[];
    };

export function getAdminReport(kind: AdminReportKind, f: AdminReportFilters, opts?: Opts): Promise<AdminReportData> {
  return sim(opts, (): AdminReportData => {
    const now = Date.now();
    const range = f.range;
    const userOk = (name: string) => !f.user || name === f.user;

    if (kind === "operations") {
      const nDays = Math.max(1, Math.ceil((range.to - range.from) / DAY));
      const days = Array.from({ length: nDays }, (_, i) => {
        const from = range.from + i * DAY;
        const to = from + DAY;
        const mv = allMovements();
        return {
          label: dayFmt.format(from),
          in: mv.filter((m) => m.entryAt !== null && m.entryAt >= from && m.entryAt < to).length,
          out: mv.filter((m) => m.exitAt !== null && m.exitAt >= from && m.exitAt < to).length,
          inside: mv.filter((m) => m.entryAt !== null && m.entryAt < to && (m.exitAt === null || m.exitAt >= to)).length,
        };
      });
      const closed = allMovements().filter((m) => m.entryAt !== null && m.exitAt !== null && inRange(m.exitAt!, range));
      const dwell = closed.length ? closed.reduce((a, m) => a + (m.exitAt! - m.entryAt!), 0) / closed.length : null;
      const ex = new Map<string, number>();
      for (const e of exceptionItems(now).filter((x) => inRange(x.at, range))) ex.set(e.kind, (ex.get(e.kind) ?? 0) + 1);
      const receipts = allReceipts().filter((r) => inRange(r.receivedAt, range));
      const lots = new Map<string, number>();
      for (const r of receipts) lots.set(receiptStatus(r), (lots.get(receiptStatus(r)) ?? 0) + 1);
      return {
        kind,
        days,
        avgDwell: dwell,
        exceptions: [...ex].map(([label, count]) => ({ label, count })),
        receipts: receipts.length,
        lots: [...lots].map(([label, count]) => ({ label, count })),
      };
    }

    if (kind === "money") {
      const totals = moneyTotals(range);
      const sales = allSales().filter((s) => inRange(s.at, range));
      const agentNames = [...new Set(sales.map((s) => s.agent))].filter(userOk);
      const agents = agentNames.map((name) => {
        const mine = sales.filter((s) => s.agent === name);
        const gross = mine.reduce((a, s) => a + saleCommission(s), 0);
        const back = allReturns()
          .filter((r) => inRange(r.at, range) && getSale(r.saleId)?.agent === name)
          .reduce((a, r) => a + r.commissionReversal, 0);
        const earned = gross - back;
        const collected = mine.reduce((a, s) => a + saleCommission(s) * saleCoverage(s), 0) - back;
        return { name, earned, collected: Math.max(0, collected), pending: Math.max(0, earned - Math.max(0, collected)) };
      });
      const bills = allBills().filter((b) => inRange(b.at, range));
      const traderNames = [...new Set(bills.map((b) => b.by))].filter(userOk);
      const traders = traderNames.map((name) => {
        const computed = bills.filter((b) => b.by === name).reduce((a, b) => a + b.saas, 0);
        const collected = allBuyerPayments().filter((p) => inRange(p.at, range) && p.by === name).reduce((a, p) => a + p.saas, 0);
        const pending = allBuyers().filter((b) => (b.owner ?? "") === name).reduce((a, b) => a + Math.max(0, buyerFinance(b.id).saasDue), 0);
        return { name, computed, collected, pending };
      });
      const dayMap = new Map<number, { label: string; commission: number; saas: number }>();
      const day = (t: number) => {
        const d = startOfDay(t);
        if (!dayMap.has(d)) dayMap.set(d, { label: dayFmt.format(d), commission: 0, saas: 0 });
        return dayMap.get(d)!;
      };
      for (const s of sales) day(s.at).commission += saleCommission(s);
      for (const p of allBuyerPayments().filter((x) => inRange(x.at, range))) day(p.at).saas += p.saas;
      return {
        kind,
        totals,
        agents,
        traders,
        byRole: [
          { label: "Commission agents (sales)", value: totals.agentSold },
          { label: "Traders (bills, goods)", value: totals.traderSold },
        ],
        days: [...dayMap].sort((a, b) => a[0] - b[0]).map(([, v]) => v),
      };
    }

    if (kind === "balances") {
      const parties = allParties()
        .map((p) => ({ id: p.id, name: p.name, kind: p.kind === "trader" ? "Trader (agent side)" : "Seller", owner: "Commission agents", balance: partyBalance(p.id), overdue: p.kind === "trader" && agentOverdue(p.id, now) }))
        .filter((p) => p.balance > 0.5);
      const buyers = allBuyers()
        .map((b) => ({ id: b.id, name: b.name, owner: b.owner ?? "Trader", balance: buyerFinance(b.id).totalDue, overdue: isBuyerOverdue(b.id, now) }))
        .filter((b) => b.balance > 0.5);
      void agentOverdueSince;
      void overdueDays;
      return { kind, parties: parties.sort((a, b) => b.balance - a.balance), buyers: buyers.sort((a, b) => b.balance - a.balance) };
    }

    const events = activityEvents(now).filter((e) => inRange(e.at, range));
    const rows = allUsers()
      .filter((u) => (!f.role || u.role === f.role) && userOk(u.name))
      .map((user) => {
        const mine = events.filter((e) => e.user === user.name);
        const last = activityEvents(now).find((e) => e.user === user.name)?.at ?? null;
        return {
          user,
          entries: mine.filter((e) => e.type === "gate_entry" || e.type === "gate_exit").length,
          receipts: mine.filter((e) => e.type === "receipt").length,
          sales: mine.filter((e) => e.type === "sale" || e.type === "return").length,
          payments: mine.filter((e) => e.type === "payment").length,
          lastActive: last ?? user.lastLoginAt,
        };
      });
    return { kind: "users", rows };
  });
}

export { roleLabel, roles, getUser };
