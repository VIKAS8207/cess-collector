import { startOfDay } from "./seed";
import { DAY, HOUR } from "./types";
import { suggestSplit } from "./trader-math";
import {
  addAdjustment,
  allBillReturns,
  allBills,
  allBuyers,
  buyerFinance,
  createBill,
  createBillReturn,
  createBuyer,
  createBuyerPayment,
  createManualPurchase,
  stockLines,
} from "./trader-store";

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

const BY = "Tara Shah";

/**
 * Builds a believable history through the real store functions, so every total
 * (cess, balances, stock) follows the same rules as live entries. Nothing is
 * dated today: a new account starts the day with empty "today" figures.
 */
export function seedTrader() {
  const r = rng(40417);
  const now = Date.now();
  const today = startOfDay(now);
  const int = (a: number, b: number) => Math.round(a + r() * (b - a));

  const buyerSeeds = [
    { name: "Anand Fruits & Veg", opening: 0 },
    { name: "Kalyan Retail Mart", opening: 25000 },
    { name: "Sundar Stores", opening: 0 },
    { name: "Hotel Annapurna", opening: 48500 },
    { name: "Greenfield Bazaar", opening: 0 },
    { name: "Rao Super Market", opening: 0 },
  ];
  const buyers = buyerSeeds.map((b) =>
    createBuyer({ name: b.name, phone: `9${String(int(100000000, 999999999))}`, address: "", opening: b.opening })
  );

  const manual: [string, "kg" | "bags" | "quintal", number, number, string, number][] = [
    ["Garlic", "kg", 800, 95, "Local mandi, Pune", 18],
    ["Jaggery", "bags", 60, 3200, "Shree Gur Udyog", 14],
    ["Ginger", "kg", 450, 110, "Satara growers", 9],
    ["Turmeric", "quintal", 12, 11800, "Sangli traders", 5],
  ];
  for (const [item, unit, qty, rate, seller, daysAgo] of manual) {
    createManualPurchase(
      { item, unit, qty, rate, seller, phone: "", remark: "", date: today - daysAgo * DAY + 11 * HOUR },
      BY,
      { at: today - daysAgo * DAY }
    );
  }

  // Bills: sell part of each older stock line, sometimes two lines on one bill.
  const stock = stockLines()
    .filter((s) => s.date < today - HOUR)
    .sort((a, b) => a.date - b.date);
  let buyerIdx = 0;
  for (let i = 0; i < stock.length; i++) {
    if (r() < 0.25) continue;
    const buyer = buyers[buyerIdx++ % buyers.length];
    const picks = [stock[i]];
    if (i + 1 < stock.length && r() < 0.3) picks.push(stock[++i]);
    const at = Math.min(Math.max(...picks.map((p) => p.date)) + int(2, 40) * HOUR, today - HOUR);
    if (at <= Math.max(...picks.map((p) => p.date))) continue;
    createBill(
      {
        buyerId: buyer.id,
        lines: picks.map((p) => ({
          stockId: p.id,
          qty: Math.max(1, Math.floor(p.remaining * (0.3 + r() * 0.5))),
          rate: Math.max(1, Math.round(p.rate * (1.05 + r() * 0.07))),
        })),
      },
      BY,
      { at }
    );
  }

  // Payments: the first buyer never pays, so it ages into overdue; the second pays in full.
  buyers.forEach((b, i) => {
    if (i === 0) return;
    const f = buyerFinance(b.id);
    if (f.totalDue <= 0) return;
    const share = i === 1 ? 1 : 0.4 + r() * 0.4;
    const amount = Math.floor(f.totalDue * share * 100) / 100;
    const { goods, cess } = suggestSplit(amount, f.goodsDue, f.cessDue);
    const last = allBills().filter((x) => x.buyerId === b.id).sort((a, c) => c.at - a.at)[0];
    const at = Math.min((last?.at ?? today - 3 * DAY) + int(4, 36) * HOUR, today - HOUR);
    createBuyerPayment(
      { buyerId: b.id, amount, goods, cess, mode: i % 2 ? "upi" : "cash", reference: "", remark: "" },
      BY,
      { at }
    );
  });

  // Returns: one after cess was fully paid (adjustment pending), one while cess is still owed.
  const paidBuyer = buyers[1];
  const paidBill = allBills().find((b) => b.buyerId === paidBuyer.id);
  if (paidBill) {
    createBillReturn(
      { billId: paidBill.id, billLineId: paidBill.lines[0].id, qty: Math.max(1, Math.floor(paidBill.lines[0].qty * 0.1)), reason: "Quality below sample" },
      BY,
      { at: Math.min(paidBill.at + 3 * DAY, today - HOUR) }
    );
  }
  const openBill = allBills().find((b) => b.buyerId === buyers[2].id);
  if (openBill && allBillReturns().length < 3) {
    createBillReturn(
      { billId: openBill.id, billLineId: openBill.lines[0].id, qty: Math.max(1, Math.floor(openBill.lines[0].qty * 0.08)), reason: "Damaged in transit" },
      BY,
      { at: Math.min(openBill.at + 2 * HOUR, today - HOUR) }
    );
  }

  // One wastage record so the flag shows.
  const wasteTarget = stockLines().find((s) => s.remaining > 20 && s.date < today - DAY);
  if (wasteTarget) {
    addAdjustment({ stockId: wasteTarget.id, kind: "wastage", qty: Math.max(1, Math.round(wasteTarget.remaining * 0.03)), remark: "Spoilage in storage" }, BY, { at: today - 6 * HOUR });
  }
  void allBuyers;
}
