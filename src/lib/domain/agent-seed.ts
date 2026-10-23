import { startOfDay } from "./seed";
import { DAY, GATE, HOUR, MINUTE, type Movement } from "./types";
import type {
  AgentData,
  Allocation,
  AgentEvent,
  CommissionSetting,
  Party,
  Payment,
  Receipt,
  Return,
  Sale,
  Unit,
} from "./agent-types";
import { commissionFor } from "./agent-math";

function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const goods: { item: string; unit: Unit; qty: [number, number]; rate: number }[] = [
  { item: "Basmati rice", unit: "bags", qty: [120, 480], rate: 2850 },
  { item: "Wheat", unit: "quintal", qty: [80, 260], rate: 2480 },
  { item: "Sugar", unit: "bags", qty: [100, 360], rate: 4150 },
  { item: "Soybean oil", unit: "pieces", qty: [60, 220], rate: 1780 },
  { item: "Onion", unit: "kg", qty: [2500, 9000], rate: 27 },
  { item: "Potato", unit: "kg", qty: [3000, 11000], rate: 21 },
  { item: "Toor dal", unit: "bags", qty: [60, 240], rate: 7400 },
  { item: "Maize", unit: "tonnes", qty: [8, 26], rate: 21500 },
];

const sellerNames = ["Shree Agro Farms", "Kisan Producer Co.", "Maharashtra Grain Traders", "Bharat Oilseeds", "Sai Krupa Growers"];
const traderNames = ["Gupta & Sons", "Ahmed Wholesale", "Lakshmi Provisions", "Rathod Traders", "Mehta Foods", "City Kirana Mart", "Prakash Stores", "Jain Brothers"];

const settings: Omit<CommissionSetting, "since">[] = [
  { type: "percent", rate: 2 },
  { type: "percent", rate: 1.5 },
  { type: "flat", rate: 5 },
  { type: "percent", rate: 2.5 },
  { type: "none", rate: 0 },
  { type: "flat", rate: 8 },
  { type: "percent", rate: 1 },
  { type: "percent", rate: 2 },
];

export function buildAgentSeed(movements: Movement[], now: number): AgentData {
  const r = rng(7731);
  const int = (a: number, b: number) => Math.round(a + r() * (b - a));
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(r() * arr.length)];
  const digits = (n: number) => Array.from({ length: n }, () => Math.floor(r() * 10)).join("");
  const today = startOfDay(now);
  const since = today - 40 * DAY;

  const sellers: Party[] = sellerNames.map((name, i) => ({
    id: `sel-${i}`,
    kind: "seller",
    name,
    phone: `9${digits(9)}`,
    address: "",
    commission: { type: "none", rate: 0, since },
    history: [],
  }));
  const traders: Party[] = traderNames.map((name, i) => {
    const c = { ...settings[i], since };
    return {
      id: `trd-${i}`,
      kind: "trader",
      name,
      phone: `9${digits(9)}`,
      address: i % 2 ? "APMC Market, Yard 2" : "",
      commission: c,
      history: [c],
      creditBlocked: i === 3,
      linkedTrader: i === 1 || i === 5,
    };
  });
  // One trader changed rate recently so "rate history" has something to show.
  const changed = { type: "percent" as const, rate: 2.5, since: today - 9 * DAY };
  traders[0].history = [...traders[0].history, changed];
  traders[0].commission = changed;

  const receipts: Receipt[] = [];
  const sales: Sale[] = [];
  const returns: Return[] = [];
  const payments: Payment[] = [];
  const events: AgentEvent[] = [];
  let rn = 1000;
  let sn = 1000;

  const candidates = movements
    .filter((m) => m.entryAt && m.status !== "Flagged" && m.entryAt > today - 30 * DAY)
    .sort((a, b) => a.entryAt! - b.entryAt!);

  // Every 3rd movement, plus the first few vehicles that are still inside.
  const inside = candidates.filter((m) => m.status === "Inside").slice(0, 3);
  const chosen = new Set<string>(inside.map((m) => m.id));
  candidates.forEach((m, i) => {
    if (i % 3 === 0) chosen.add(m.id);
  });

  for (const m of candidates) {
    if (!chosen.has(m.id)) continue;
    const receivedAt = Math.min(m.entryAt! + int(12, 40) * MINUTE, now - 5 * MINUTE);
    const seller = pick(sellers);
    const n = r() < 0.35 ? int(2, 3) : 1;
    const used = new Set<string>();
    const lines = Array.from({ length: n }, (_, k) => {
      let g = pick(goods);
      while (used.has(g.item)) g = pick(goods);
      used.add(g.item);
      const expected = int(g.qty[0], g.qty[1]);
      const diff = r() < 0.12 ? -int(1, Math.max(2, Math.round(expected * 0.03))) : 0;
      const wastage = r() < 0.15 ? int(1, Math.max(2, Math.round(expected * 0.01))) : 0;
      return {
        id: `rl-${rn}-${k}`,
        item: g.item,
        unit: g.unit,
        expected,
        actual: expected + diff,
        wastage,
        wastageRemark: wastage ? "Torn bags / spoilage at unloading" : "",
      };
    });
    rn += 1;
    const receipt: Receipt = {
      id: `rc-${rn}`,
      no: `GR-${rn}`,
      movementId: m.id,
      plate: m.plate,
      driverName: m.driverName,
      transporter: m.transporter,
      entryAt: m.entryAt,
      sellerId: seller.id,
      lines,
      remark: "",
      receivedAt,
      agent: "Avery Morgan",
      gate: GATE,
      mismatch: lines.some((l) => l.expected !== null && l.expected !== l.actual),
    };
    receipts.push(receipt);
    events.push({ id: `ev-r-${rn}`, kind: "received", at: receivedAt, text: `Received ${receipt.plate || m.fastag}: ${lines.map((l) => l.item).join(", ")}`, receiptId: receipt.id });
  }

  // Sell part of most lots, to different traders. Trader 0 never pays, so it ages into overdue.
  for (const receipt of receipts) {
    if (r() < 0.22) continue; // stays unsold
    const age = now - receipt.receivedAt;
    if (age < HOUR) continue;
    for (const line of receipt.lines) {
      const avail = line.actual - line.wastage;
      const g = goods.find((x) => x.item === line.item)!;
      let left = avail;
      const parts = r() < 0.4 ? 2 : 1;
      for (let p = 0; p < parts && left > 0; p++) {
        const portion = r() < 0.3 && p === 0 ? 0.55 : 1;
        const qty = Math.max(1, Math.floor((p === parts - 1 ? left : left * (0.4 + r() * 0.3)) * portion));
        if (qty <= 0) continue;
        left -= qty;
        const party = r() < 0.18 ? traders[0] : pick(traders);
        const rate = Math.round(g.rate * (0.96 + r() * 0.09));
        const at = Math.min(receipt.receivedAt + int(30, Math.max(40, Math.round(age / MINUTE))) * MINUTE, now - MINUTE);
        const amount = qty * rate;
        const com = commissionFor(party.commission, qty, amount);
        sn += 1;
        const sale: Sale = {
          id: `sl-${sn}`,
          no: `SL-${sn}`,
          receiptId: receipt.id,
          receiptNo: receipt.no,
          plate: receipt.plate,
          partyId: party.id,
          partyName: party.name,
          sellerId: receipt.sellerId,
          at,
          agent: "Avery Morgan",
          lines: [
            {
              id: `sll-${sn}`,
              receiptLineId: line.id,
              item: line.item,
              unit: line.unit,
              qty,
              rate,
              amount,
              commission: com.amount,
              commissionLabel: com.label,
            },
          ],
        };
        sales.push(sale);
        events.push({ id: `ev-s-${sn}`, kind: "sold", at, text: `Sold ${qty} ${line.unit} ${line.item} to ${party.name}`, saleId: sale.id, receiptId: receipt.id, partyId: party.id });
      }
    }
  }

  // A few returns.
  const returnable = sales.filter((s) => s.lines[0].qty > 10 && now - s.at > 3 * HOUR);
  for (let i = 0; i < Math.min(4, returnable.length); i++) {
    const s = returnable[i * 5 % returnable.length];
    const l = s.lines[0];
    const qty = Math.max(1, Math.round(l.qty * 0.05));
    const at = Math.min(s.at + int(60, 600) * MINUTE, now - MINUTE);
    returns.push({
      id: `rt-${i}`,
      saleId: s.id,
      saleLineId: l.id,
      receiptId: s.receiptId,
      receiptLineId: l.receiptLineId,
      partyId: s.partyId,
      item: l.item,
      unit: l.unit,
      qty,
      rate: l.rate,
      amount: qty * l.rate,
      commissionReversal: (l.commission * qty) / l.qty,
      reason: "Quality below sample",
      at,
      by: "Avery Morgan",
    });
    events.push({ id: `ev-t-${i}`, kind: "returned", at, text: `Return ${qty} ${l.unit} ${l.item} from ${s.partyName}`, saleId: s.id, receiptId: s.receiptId, partyId: s.partyId });
  }

  // Payments: traders pay most of what they owe; sellers get part of their payable.
  traders.forEach((t, i) => {
    if (i === 0) return;
    const due = sales.filter((s) => s.partyId === t.id).reduce((a, s) => a + s.lines.reduce((b, l) => b + l.amount, 0), 0);
    const credit = returns.filter((x) => x.partyId === t.id).reduce((a, x) => a + x.amount, 0);
    const pay = Math.round(((due - credit) * (0.55 + r() * 0.4)) / 100) * 100;
    if (pay <= 0) return;
    const oldest = sales.filter((s) => s.partyId === t.id).sort((a, b) => a.at - b.at)[0];
    const at = Math.min(Math.max(oldest?.at ?? now, today - 5 * DAY) + 6 * HOUR, now - MINUTE);
    payments.push({ id: `pay-t${i}`, partyId: t.id, direction: "in", amount: pay, mode: pick(["cash", "upi", "bank", "cheque"] as const), reference: i % 2 ? `UTR${digits(8)}` : "", remark: "", at, by: "Avery Morgan" });
    events.push({ id: `ev-p-t${i}`, kind: "paid", at, text: `Received ₹${pay.toLocaleString("en-IN")} from ${t.name}`, partyId: t.id });
  });
  sellers.forEach((s, i) => {
    const owned = sales.filter((x) => x.sellerId === s.id);
    const value = owned.reduce((a, x) => a + x.lines.reduce((b, l) => b + l.amount - l.commission, 0), 0);
    const pay = Math.round((value * 0.5) / 100) * 100;
    if (pay <= 0) return;
    const at = now - (i + 1) * 5 * HOUR;
    payments.push({ id: `pay-s${i}`, partyId: s.id, direction: "out", amount: pay, mode: "bank", reference: `NEFT${digits(8)}`, remark: "Part payment", at, by: "Avery Morgan" });
    events.push({ id: `ev-p-s${i}`, kind: "paid", at, text: `Paid ₹${pay.toLocaleString("en-IN")} to ${s.name}`, partyId: s.id });
  });

  events.sort((a, b) => b.at - a.at);

  // A few allocations from trucks that have been through the gate, so the list is not empty.
  const allocations: Allocation[] = [];
  const insideNow = movements.filter((m) => m.status === "Inside" && m.plate && m.weighments?.length);
  const past = movements.filter((m) => m.status === "Exited" && m.plate && m.weighments?.length).slice(0, 6);
  // The demo drivers get goods handled on their earlier trips too, so their history shows a commission agent.
  const demoDrivers = movements
    .filter((m) => m.status === "Exited" && m.plate && m.weighments?.length && (m.driverName === "Ramesh Gaikwad" || m.driverName === "Suresh Jadhav") && !past.includes(m))
    .slice(0, 8);
  const inScope = [...insideNow, ...past, ...demoDrivers];
  inScope.forEach((m, i) => {
    const product = m.weighments?.[0]?.product ?? pick(["Basmati rice", "Wheat", "Sugar", "Onion", "Toor dal"]);
    const unit: Allocation["unit"] = product === "Onion" ? "kg" : "bags";
    const shared = i % 2 === 0 ? 2 : 3;
    for (let k = 0; k < shared; k++) {
      const t = traders[(i + k * 3) % traders.length];
      const qty = int(40, 300);
      const rate = unit === "kg" ? int(18, 40) : int(900, 3200);
      const amount = Math.round(qty * rate * 100) / 100;
      const at = (m.entryAt ?? now) + (30 + k * 5) * 60_000;
      allocations.push({
        id: `al-seed-${i}-${k}`,
        no: `AL-${1000 + allocations.length + 1}`,
        movementId: m.id,
        plate: m.plate,
        driverName: m.driverName,
        product,
        unit,
        qty,
        rate,
        amount,
        cess: Math.round(amount * 2) / 100,
        cessLabel: "2% of value",
        partyId: t.id,
        partyName: t.name,
        at: Math.min(at, now),
        agent: k % 2 === 0 ? "Ravi Kumar" : "Imran Khan",
        supplier: sellers[(i + k) % sellers.length].name,
        origin: pick(["Nashik", "Pune", "Indore", "Latur", "Sangli"]),
        challanNo: `CH-${digits(5)}`,
        bridgeNetKg: m.weighments?.length === 2 ? m.weighments[1].kg - m.weighments[0].kg : null,
        billNo: `BL-${digits(5)}`,
        traderLicence: `LIC-${digits(6)}`,
        traderGstin: "",
        cessPaid: k === 0 && i % 2 === 0 ? 0 : Math.round(amount * 2) / 100,
        cessStatus: k === 0 && i % 2 === 0 ? "pending" : "collected",
        cessMode: k === 0 && i % 2 === 0 ? undefined : pick(["cash", "upi", "bank"] as const),
        cessRef: "",
        cessReceiptNo: k === 0 && i % 2 === 0 ? "" : `CR-${1000 + allocations.length + 1}`,
        cessReceivedBy: k === 0 && i % 2 === 0 ? "" : k % 2 === 0 ? "Ravi Kumar" : "Imran Khan",
      });
    }
  });
  allocations.sort((a, b) => b.at - a.at);
  return { parties: [...traders, ...sellers], receipts, sales, returns, payments, events, allocations };
}
