import { commit, db } from "./store";
import { startOfDay } from "./seed";
import { DAY } from "./types";
import { config, retentionMs, type BusinessInfo, type Gate } from "./settings";
import { setCommission, getParty } from "./agent-store";
import { describeCommission } from "./agent-math";
import { describeSaas } from "./trader-math";
import { td } from "./trader-store";
import { roleLabel, type RoleId } from "@/lib/roles";
import type { CommissionType, Unit } from "./agent-types";
import type {
  ActivityEvent,
  ActivityType,
  AppUser,
  AuditCategory,
  AuditEntry,
  MasterEntry,
  MasterKind,
  OtpRecord,
} from "./admin-types";

const uid = () => Math.random().toString(36).slice(2, 9);

type AdminData = {
  users: AppUser[];
  audit: AuditEntry[];
  masters: MasterEntry[];
  otps: Map<string, OtpRecord>;
  /** Last resend per user, used for the cooldown. */
  lastOtpAt: Map<string, number>;
  blockedOtp: { at: number; userId: string; name: string }[];
};

let data: AdminData | null = null;

/** Admin data is built on first use and lives for the page session, like the other mock stores. */
function ad(): AdminData {
  if (data) return data;
  const now = Date.now();
  const today = startOfDay(now);
  const mk = (name: string, email: string, role: RoleId, status: "active" | "inactive", daysAgo: number, login: number | null): AppUser => ({
    id: `usr-${uid()}`,
    name,
    email,
    role,
    status,
    createdAt: today - daysAgo * DAY,
    createdBy: "Asha Menon",
    lastLoginAt: login === null ? null : now - login,
    resetState: "none",
    password: "1234",
  });
  const hour = 3_600_000;
  const users = [
    mk("Asha Menon", "asha.menon@company.com", "admin", "active", 90, 2 * hour),
    mk("Avery Morgan", "avery.morgan@company.com", "gate_operator", "active", 80, 5 * hour),
    mk("Meera Shah", "meera.shah@company.com", "gate_operator", "active", 70, 30 * hour),
    mk("Kabir Anand", "kabir.anand@company.com", "gate_operator", "inactive", 60, 12 * DAY),
    mk("Ravi Kumar", "ravi.kumar@company.com", "commission_agent", "active", 75, 3 * hour),
    mk("Imran Khan", "imran.khan@company.com", "commission_agent", "active", 40, 2 * DAY),
    mk("Tara Shah", "tara.shah@company.com", "trader", "active", 50, 1 * hour),
    mk("Neha Rao", "neha.rao@company.com", "trader", "active", 20, 4 * DAY),
  ];
  config.saas.since = today - 45 * DAY;
  config.saas.lastChangedAt = today - 9 * DAY;
  config.saas.lastChangedBy = "Asha Menon";

  const item = (label: string, unit: Unit): MasterEntry => ({ id: `m-${uid()}`, kind: "items", label, defaultUnit: unit, active: true });
  const simple = (kind: MasterKind, label: string, id?: string): MasterEntry => ({ id: id ?? `m-${uid()}`, kind, label, active: true });
  const masters: MasterEntry[] = [
    item("Basmati rice", "bags"),
    item("Wheat", "quintal"),
    item("Sugar", "bags"),
    item("Soybean oil", "pieces"),
    item("Onion", "kg"),
    item("Potato", "kg"),
    item("Toor dal", "bags"),
    item("Maize", "tonnes"),
    ...["Truck", "Trailer", "Tanker", "Container", "Pickup"].map((l) => simple("vehicleTypes", l)),
    ...["Delivery", "Pickup", "Transfer", "Service"].map((l) => simple("purposes", l)),
    simple("paymentModes", "Cash", "cash"),
    simple("paymentModes", "UPI", "upi"),
    simple("paymentModes", "Bank transfer", "bank"),
    simple("paymentModes", "Cheque", "cheque"),
  ];

  const audit: AuditEntry[] = [
    { id: `au-${uid()}`, at: today - 9 * DAY + 10 * hour, admin: "Asha Menon", category: "settings", entity: "Saas rate", entityLabel: "Saas (admin rate)", action: "rate_change", oldValue: "1.5% of goods value", newValue: "2% of goods value", href: "/settings" },
    { id: `au-${uid()}`, at: today - 20 * DAY + 11 * hour, admin: "Asha Menon", category: "users", entity: "User", entityLabel: "Neha Rao", action: "create", newValue: "Trader · Active" },
    { id: `au-${uid()}`, at: today - 12 * DAY + 15 * hour, admin: "Asha Menon", category: "users", entity: "User", entityLabel: "Kabir Anand", action: "deactivate", oldValue: "Active", newValue: "Inactive" },
  ];

  data = { users, audit, masters, otps: new Map(), lastOtpAt: new Map(), blockedOtp: [] };
  return data;
}

function note(
  category: AuditCategory,
  admin: string,
  entity: string,
  entityLabel: string,
  action: string,
  oldValue?: string,
  newValue?: string,
  href?: string
) {
  ad().audit.unshift({ id: `au-${uid()}`, at: Date.now(), admin, category, entity, entityLabel, action, oldValue, newValue, href });
}

// ---------- users ----------

export const allUsers = () => ad().users;
export const getUser = (id: string) => ad().users.find((u) => u.id === id);
export const findUserByEmail = (email: string) => ad().users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());

/** Records a user has made across every role. Users with records are never deletable. */
export function userRecordCount(u: AppUser): number {
  const s = db();
  const t = td();
  const n = u.name;
  return (
    s.movements.filter((m) => m.operator === n || m.exitOperator === n).length +
    s.agent.receipts.filter((r) => r.agent === n).length +
    s.agent.sales.filter((x) => x.agent === n).length +
    s.agent.returns.filter((x) => x.by === n).length +
    s.agent.payments.filter((x) => x.by === n).length +
    t.bills.filter((b) => b.by === n).length +
    t.returns.filter((r) => r.by === n).length +
    t.payments.filter((p) => p.by === n).length
  );
}

export function createUser(input: { name: string; email: string; role: RoleId }, admin: string):
  | { ok: true; user: AppUser }
  | { ok: false; code: "duplicate" } {
  if (findUserByEmail(input.email)) return { ok: false, code: "duplicate" };
  const user: AppUser = {
    id: `usr-${uid()}`,
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    role: input.role,
    status: "active",
    createdAt: Date.now(),
    createdBy: admin,
    lastLoginAt: null,
    resetState: "none",
    password: "1234",
  };
  ad().users.unshift(user);
  note("users", admin, "User", user.name, "create", undefined, `${roleLabel(user.role)} · Active`, `/users?user=${user.id}`);
  commit();
  return { ok: true, user };
}

export function setUserRole(id: string, role: RoleId, admin: string): AppUser | null {
  const u = getUser(id);
  if (!u || u.role === role) return u ?? null;
  const old = u.role;
  u.role = role;
  note("users", admin, "User", u.name, "update", `Role: ${roleLabel(old)}`, `Role: ${roleLabel(role)}`, `/users?user=${u.id}`);
  commit();
  return u;
}

export function setUserActive(id: string, active: boolean, admin: string): AppUser | null {
  const u = getUser(id);
  if (!u) return null;
  const old = u.status;
  u.status = active ? "active" : "inactive";
  if (!active) {
    ad().otps.delete(u.id);
    if (u.resetState === "otp_sent") u.resetState = "none";
  }
  note("users", admin, "User", u.name, active ? "activate" : "deactivate", old === "active" ? "Active" : "Inactive", active ? "Active" : "Inactive", `/users?user=${u.id}`);
  commit();
  return u;
}

export function otpFor(userId: string) {
  return ad().otps.get(userId);
}

export const otpLastSent = (userId: string) => ad().lastOtpAt.get(userId) ?? null;

/** Seconds until this user's OTP can be sent again (0 when allowed now). */
export function otpWaitSeconds(userId: string, now: number): number {
  const last = ad().lastOtpAt.get(userId);
  if (!last) return 0;
  return Math.max(0, Math.ceil((last + config.otpCooldownSeconds * 1000 - now) / 1000));
}

export function sendResetOtp(id: string, admin: string):
  | { ok: true; code: string }
  | { ok: false; code: "cooldown"; wait: number }
  | { ok: false; code: "inactive" | "missing" } {
  const u = getUser(id);
  if (!u) return { ok: false, code: "missing" };
  if (u.status !== "active") return { ok: false, code: "inactive" };
  const wait = otpWaitSeconds(id, Date.now());
  if (wait > 0) {
    ad().blockedOtp.unshift({ at: Date.now(), userId: id, name: u.name });
    commit();
    return { ok: false, code: "cooldown", wait };
  }
  let code = String(100000 + Math.floor(Math.random() * 900000));
  if (code === "123456" || code === "000000") code = "482916";
  ad().otps.set(id, { code, sentAt: Date.now(), revoked: false, attempts: 5 });
  ad().lastOtpAt.set(id, Date.now());
  u.resetState = "otp_sent";
  note("users", admin, "User", u.name, "otp_send", u.resetState === "otp_sent" ? "Reset: none" : undefined, "Reset: OTP sent", `/users?user=${u.id}`);
  commit();
  return { ok: true, code };
}

export function revokeOtp(id: string, admin: string): AppUser | null {
  const u = getUser(id);
  if (!u || u.resetState !== "otp_sent") return u ?? null;
  const rec = ad().otps.get(id);
  if (rec) rec.revoked = true;
  u.resetState = "none";
  note("users", admin, "User", u.name, "otp_revoke", "Reset: OTP sent", "Reset: none", `/users?user=${u.id}`);
  commit();
  return u;
}

export const recentBlockedOtp = () => ad().blockedOtp;

// ---------- mock sign-in, used by the existing login and reset flows ----------

export type AuthCheck =
  | { status: "unknown" }
  | { status: "inactive" }
  | { status: "wrong-role"; actual: RoleId }
  | { status: "bad-password" }
  | { status: "ok"; user: AppUser };

export function checkCredentials(email: string, password: string, role: RoleId): AuthCheck {
  const u = findUserByEmail(email);
  if (!u) return { status: "unknown" };
  if (u.status !== "active") return { status: "inactive" };
  if (u.role !== role) return { status: "wrong-role", actual: u.role };
  if (u.password !== password) return { status: "bad-password" };
  return { status: "ok", user: u };
}

export function markLogin(email: string) {
  const u = findUserByEmail(email);
  if (u) u.lastLoginAt = Date.now();
}

/** Result of checking a reset code. `null` means the admin has not issued an OTP for this email. */
export function verifyAdminOtp(email: string, code: string): "ok" | "wrong" | "expired" | null {
  const u = findUserByEmail(email);
  if (!u) return null;
  const rec = ad().otps.get(u.id);
  if (!rec) return null;
  if (rec.revoked || rec.attempts <= 0) return "expired";
  if (rec.code === code) return "ok";
  rec.attempts -= 1;
  return rec.attempts <= 0 ? "expired" : "wrong";
}

export function adminOtpAttempts(email: string): number | null {
  const u = findUserByEmail(email);
  const rec = u ? ad().otps.get(u.id) : undefined;
  return rec ? rec.attempts : null;
}

export function completePasswordReset(email: string, password: string) {
  const u = findUserByEmail(email);
  if (!u) return;
  u.password = password;
  u.resetState = "cleared";
  ad().otps.delete(u.id);
  note("users", u.name, "User", u.name, "password_reset", "Reset: OTP sent", "Reset: cleared (set by user)", `/users?user=${u.id}`);
  commit();
}

// ---------- settings ----------

export function saveSaas(input: { enabled: boolean; type: "percent" | "flat"; rate: number }, admin: string) {
  const s = config.saas;
  const before = describeSaas(s);
  s.enabled = input.enabled;
  s.type = input.type;
  s.rate = input.rate;
  s.since = Date.now();
  s.lastChangedAt = Date.now();
  s.lastChangedBy = admin;
  note("settings", admin, "Saas rate", "Saas (admin rate)", "rate_change", before, describeSaas(s), "/settings");
  commit();
}

export function saveThresholds(input: { overstayHours: number; overdueDays: number; otpCooldownSeconds: number }, admin: string) {
  const rows: [string, keyof typeof input, string][] = [
    ["Overstay hours", "overstayHours", "h"],
    ["Overdue days", "overdueDays", "days"],
    ["OTP cooldown", "otpCooldownSeconds", "s"],
  ];
  for (const [label, key, unit] of rows) {
    const old = config[key];
    if (old !== input[key]) {
      config[key] = input[key];
      note("settings", admin, "Threshold", label, "threshold_change", `${old} ${unit}`, `${input[key]} ${unit}`, "/settings");
    }
  }
  commit();
}

export function addGate(name: string, admin: string): Gate {
  const g: Gate = { id: `gate-${uid()}`, name: name.trim(), active: true };
  config.gates.push(g);
  note("settings", admin, "Gate", g.name, "create", undefined, "Active", "/settings");
  commit();
  return g;
}

export function renameGate(id: string, name: string, admin: string) {
  const g = config.gates.find((x) => x.id === id);
  if (!g || g.name === name.trim()) return;
  const old = g.name;
  g.name = name.trim();
  note("settings", admin, "Gate", g.name, "update", old, g.name, "/settings");
  commit();
}

export function setGateActive(id: string, active: boolean, admin: string): { ok: true } | { ok: false; code: "last-active" } {
  const g = config.gates.find((x) => x.id === id);
  if (!g) return { ok: true };
  if (!active && config.gates.filter((x) => x.active).length <= 1 && g.active) return { ok: false, code: "last-active" };
  const old = g.active;
  g.active = active;
  note("settings", admin, "Gate", g.name, active ? "activate" : "deactivate", old ? "Active" : "Inactive", active ? "Active" : "Inactive", "/settings");
  commit();
  return { ok: true };
}

export function saveBusiness(input: BusinessInfo, admin: string) {
  const b = config.business;
  const before = `${b.name}, ${b.address}, ${b.city}, ${b.phone}`;
  Object.assign(b, input);
  note("settings", admin, "Business info", b.name, "update", before, `${b.name}, ${b.address}, ${b.city}, ${b.phone}`, "/settings");
  commit();
}

// ---------- masters ----------

export const allMasters = (kind?: MasterKind) => ad().masters.filter((m) => !kind || m.kind === kind);
export const activeLabels = (kind: MasterKind) => ad().masters.filter((m) => m.kind === kind && m.active).map((m) => m.label);
export const activePayModes = () =>
  ad().masters.filter((m) => m.kind === "paymentModes" && m.active).map((m) => ({ value: m.id, label: m.label }));

const kindLabel: Record<MasterKind, string> = { items: "Item", vehicleTypes: "Vehicle type", purposes: "Purpose", paymentModes: "Payment mode" };

export function addMaster(kind: MasterKind, label: string, unit: Unit | undefined, admin: string): { ok: true; entry: MasterEntry } | { ok: false; code: "duplicate" } {
  const clean = label.trim();
  if (ad().masters.some((m) => m.kind === kind && m.label.toLowerCase() === clean.toLowerCase())) return { ok: false, code: "duplicate" };
  const entry: MasterEntry = {
    id: kind === "paymentModes" ? clean.toLowerCase().replace(/\W+/g, "-") : `m-${uid()}`,
    kind,
    label: clean,
    defaultUnit: kind === "items" ? unit : undefined,
    active: true,
  };
  ad().masters.push(entry);
  note("masters", admin, kindLabel[kind], clean, "create", undefined, kind === "items" ? `${unit ?? ""} · Active` : "Active", `/masters?tab=${kind}`);
  commit();
  return { ok: true, entry };
}

export function updateMaster(id: string, patch: { label?: string; defaultUnit?: Unit }, admin: string) {
  const m = ad().masters.find((x) => x.id === id);
  if (!m) return;
  const before = `${m.label}${m.defaultUnit ? ` · ${m.defaultUnit}` : ""}`;
  if (patch.label) m.label = patch.label.trim();
  if (patch.defaultUnit) m.defaultUnit = patch.defaultUnit;
  note("masters", admin, kindLabel[m.kind], m.label, "update", before, `${m.label}${m.defaultUnit ? ` · ${m.defaultUnit}` : ""}`, `/masters?tab=${m.kind}`);
  commit();
}

export function setMasterActive(id: string, active: boolean, admin: string) {
  const m = ad().masters.find((x) => x.id === id);
  if (!m) return;
  const old = m.active;
  m.active = active;
  note("masters", admin, kindLabel[m.kind], m.label, active ? "activate" : "deactivate", old ? "Active" : "Inactive", active ? "Active" : "Inactive", `/masters?tab=${m.kind}`);
  commit();
}

/** How many receipt, sale and stock lines mention this item name. */
export function itemUsage(label: string): number {
  const s = db();
  const l = label.toLowerCase();
  const t = td();
  return (
    s.agent.receipts.reduce((a, r) => a + r.lines.filter((x) => x.item.toLowerCase() === l).length, 0) +
    s.agent.sales.reduce((a, x) => a + x.lines.filter((y) => y.item.toLowerCase() === l).length, 0) +
    t.bills.reduce((a, b) => a + b.lines.filter((y) => y.item.toLowerCase() === l).length, 0) +
    t.manual.filter((m) => m.item.toLowerCase() === l).length
  );
}

export function setPartyActive(id: string, active: boolean, admin: string) {
  const p = getParty(id);
  if (!p) return;
  const old = p.active !== false;
  p.active = active;
  note("masters", admin, "Party", p.name, active ? "activate" : "deactivate", old ? "Active" : "Inactive", active ? "Active" : "Inactive", `/masters?tab=parties&id=${p.id}`);
  commit();
}

export function changePartyCommission(id: string, s: { type: CommissionType; rate: number }, admin: string) {
  const p = getParty(id);
  if (!p) return;
  const before = describeCommission(p.commission);
  setCommission(id, s);
  note("masters", admin, "Party", p.name, "rate_change", before, describeCommission(p.commission), `/masters?tab=parties&id=${p.id}`);
}

export function updateBuyer(id: string, patch: { name: string; phone: string; address: string }, admin: string) {
  const b = td().buyers.find((x) => x.id === id);
  if (!b) return;
  const before = `${b.name}, ${b.phone}${b.address ? `, ${b.address}` : ""}`;
  b.name = patch.name.trim();
  b.phone = patch.phone.trim();
  b.address = patch.address.trim();
  note("masters", admin, "Buyer", b.name, "update", before, `${b.name}, ${b.phone}${b.address ? `, ${b.address}` : ""}`, `/masters?tab=buyers&id=${b.id}`);
  commit();
}

export function setBuyerActive(id: string, active: boolean, admin: string) {
  const b = td().buyers.find((x) => x.id === id);
  if (!b) return;
  const old = b.active !== false;
  b.active = active;
  note("masters", admin, "Buyer", b.name, active ? "activate" : "deactivate", old ? "Active" : "Inactive", active ? "Active" : "Inactive", `/masters?tab=buyers&id=${b.id}`);
  commit();
}

// ---------- activity (audit) ----------

const typeOfCategory: Record<AuditCategory, ActivityType> = { settings: "settings", users: "users", masters: "masters" };

/** All events across every role, newest first. Entries older than the retention window are left out. */
export function activityEvents(now: number): ActivityEvent[] {
  const s = db();
  const t = td();
  const out: ActivityEvent[] = [];
  const push = (e: ActivityEvent) => out.push(e);

  for (const m of s.movements) {
    if (m.entryAt) {
      push({ id: `${m.id}-in`, at: m.entryAt, role: "gate_operator", user: m.operator, type: "gate_entry", summary: `Entry ${m.plate || m.fastag} · ${m.driverName}`, ref: m.plate || m.fastag, payload: [["Entry no", m.entryNo], ["Plate", m.plate], ["FASTag", m.fastag], ["Driver", m.driverName], ["Vehicle type", m.vehicleType], ["Purpose", m.purpose], ["Gate", m.gate]] });
    }
    if (m.exitAt) {
      push({ id: `${m.id}-out`, at: m.exitAt, role: "gate_operator", user: m.exitOperator ?? m.operator, type: "gate_exit", summary: `Exit ${m.plate || m.fastag} approved`, ref: m.plate || m.fastag, payload: [["Entry no", m.entryNo], ["Plate", m.plate], ["Driver", m.driverName], ["Gate", m.gate]] });
    }
    for (const [i, w] of (m.weighments ?? []).entries()) {
      push({ id: `${m.id}-w${i}`, at: w.at, role: "gate_operator", user: w.by, type: "weighment", summary: `Weighed ${m.plate || m.fastag}: ${w.kg.toLocaleString("en-IN")} kg`, ref: m.plate || m.fastag, payload: [["Entry no", m.entryNo], ["Plate", m.plate], ["Weight", `${w.kg} kg`], ["Source", w.source === "bridge" ? "Weight bridge" : "Typed in"]] });
    }
    if (m.status === "Flagged" && m.flag) {
      push({ id: `${m.id}-flag`, at: m.flag.at, role: "gate_operator", user: m.operator, type: "gate_exit", summary: `Exit without entry flagged ${m.plate || m.fastag}`, ref: m.plate || m.fastag, payload: [["Reason", m.flag.reason], ["Plate", m.plate]] });
    }
  }
  for (const r of s.agent.receipts) {
    push({ id: r.id, at: r.receivedAt, role: "commission_agent", user: r.agent, type: "receipt", summary: `Receipt ${r.no} · ${r.plate || "vehicle"} · ${r.lines.map((l) => l.item).join(", ")}`, ref: r.no, payload: [["Receipt", r.no], ["Plate", r.plate], ["Lines", r.lines.map((l) => `${l.item} ${l.actual} ${l.unit}`).join("; ")], ["Mismatch", r.mismatch ? "Yes" : "No"]] });
  }
  for (const x of s.agent.sales) {
    const total = x.lines.reduce((a, l) => a + l.amount, 0);
    push({ id: x.id, at: x.at, role: "commission_agent", user: x.agent, type: "sale", summary: `Sale ${x.no} to ${x.partyName} · ₹${Math.round(total).toLocaleString("en-IN")}`, ref: x.no, payload: [["Sale", x.no], ["Party", x.partyName], ["Receipt", x.receiptNo], ["Lines", x.lines.map((l) => `${l.item} ${l.qty} ${l.unit} @ ₹${l.rate}`).join("; ")], ["Commission", `₹${x.lines.reduce((a, l) => a + l.commission, 0)}`]] });
  }
  for (const x of s.agent.returns) {
    push({ id: x.id, at: x.at, role: "commission_agent", user: x.by, type: "return", summary: `Return ${x.qty} ${x.unit} ${x.item}`, ref: x.item, payload: [["Item", x.item], ["Quantity", `${x.qty} ${x.unit}`], ["Reason", x.reason]] });
  }
  for (const x of s.agent.payments) {
    push({ id: x.id, at: x.at, role: "commission_agent", user: x.by, type: "payment", summary: `${x.direction === "in" ? "Received" : "Paid"} ₹${x.amount.toLocaleString("en-IN")} · ${getParty(x.partyId)?.name ?? ""}`, ref: x.reference || x.mode, payload: [["Party", getParty(x.partyId)?.name ?? ""], ["Amount", `₹${x.amount}`], ["Mode", x.mode], ["Reference", x.reference]] });
  }
  for (const p of t.manual) {
    push({ id: p.id, at: p.date, role: "trader", user: "Tara Shah", type: "receipt", summary: `Purchase ${p.qty} ${p.unit} ${p.item} from ${p.seller}`, ref: p.item, payload: [["Item", p.item], ["Quantity", `${p.qty} ${p.unit}`], ["Rate", `₹${p.rate}`], ["Seller", p.seller]] });
  }
  for (const b of t.bills) {
    push({ id: b.id, at: b.at, role: "trader", user: b.by, type: "sale", summary: `Bill ${b.no} to ${b.buyerName} · ₹${Math.round(b.payable).toLocaleString("en-IN")}`, ref: b.no, payload: [["Bill", b.no], ["Buyer", b.buyerName], ["Goods", `₹${b.goods}`], ["Saas", `₹${b.saas}${b.saasBasis ? ` (${b.saasBasis})` : ""}`], ["Payable", `₹${b.payable}`]] });
  }
  for (const r of t.returns) {
    push({ id: r.id, at: r.at, role: "trader", user: r.by, type: "return", summary: `Return ${r.qty} ${r.unit} ${r.item}`, ref: r.item, payload: [["Item", r.item], ["Quantity", `${r.qty} ${r.unit}`], ["Goods credit", `₹${r.goodsCredit}`], ["Saas adjustment pending", `₹${r.saasAdjust}`], ["Reason", r.reason]] });
  }
  for (const p of t.payments) {
    push({ id: p.id, at: p.at, role: "trader", user: p.by, type: "payment", summary: `Received ₹${p.amount.toLocaleString("en-IN")} from ${t.buyers.find((b) => b.id === p.buyerId)?.name ?? "buyer"}`, ref: p.reference || p.mode, payload: [["Amount", `₹${p.amount}`], ["Goods part", `₹${p.goods}`], ["Saas part", `₹${p.saas}`], ["Mode", p.mode], ["Reference", p.reference]] });
  }
  for (const a of ad().audit) {
    push({ id: a.id, at: a.at, role: "admin", user: a.admin, type: typeOfCategory[a.category], summary: `${a.entity}: ${a.entityLabel} · ${a.action.replace(/_/g, " ")}`, ref: a.entityLabel, payload: [["Entity", a.entity], ["Name", a.entityLabel], ["Action", a.action]], oldValue: a.oldValue, newValue: a.newValue, href: a.href });
  }

  const cutoff = now - retentionMs();
  return out.filter((e) => e.at >= cutoff).sort((a, b) => b.at - a.at);
}

export const auditFor = (label: string) => ad().audit.filter((a) => a.entityLabel === label).slice(0, 5);
